import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardDefinition } from "@pachinko/board-schema";
import { FixedTimestepAccumulator, PachinkoPhysicsEngine, type SimulationSnapshot } from "@pachinko/physics-core";
import { PixiBoardRenderer, DEFAULT_DEBUG_DRAW, type DebugDrawOptions } from "@pachinko/renderer-pixi";
import { PlayAudio } from "./PlayAudio.js";

export type PlayPhase = "NORMAL" | "RUSH";
export type LotteryPhase = "IDLE" | "CHANCE" | "REACH" | "FREEZE" | "RESULT" | "JACKPOT";

export interface SimulationControls {
  readonly power: number;
  readonly fireRate: 25 | 50 | 75 | 100;
  readonly simulationSpeed: 1 | 2 | 4 | 8 | 16;
  readonly ccd: boolean;
  readonly autoFire: boolean;
}

export interface RuntimeStats {
  readonly fps: number;
  readonly physicsHz: number;
  readonly stepMs: number;
  readonly activeBalls: number;
  readonly launched: number;
  readonly start: number;
  readonly out: number;
  readonly through: number;
  readonly electricSupport: number;
  readonly attacker: number;
}

const EMPTY: SimulationSnapshot = { tick: 0, simulationTime: 0, balls: [], contacts: [] };

export function useSimulation(board: BoardDefinition, controls: SimulationControls) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<PachinkoPhysicsEngine | null>(null);
  const rendererRef = useRef<PixiBoardRenderer | null>(null);
  const controlsRef = useRef(controls);
  const debugRef = useRef<DebugDrawOptions>(DEFAULT_DEBUG_DRAW);
  const sequenceRef = useRef(0);
  const lastAutoTickRef = useRef(-Infinity);
  const countsRef = useRef({ launched: 0, start: 0, out: 0, through: 0, electricSupport: 0, attacker: 0 });
  const phaseRef = useRef<PlayPhase>("NORMAL");
  const rushShotsRef = useRef(0);
  const lotteryStateRef = useRef(0x15e7a319);
  const audioRef = useRef<PlayAudio | null>(null);
  const lotteryTimersRef = useRef<number[]>([]);
  const holdQueueRef = useRef<number[]>([]);
  const lotteryBusyRef = useRef(false);
  const [phase, setPhase] = useState<PlayPhase>("NORMAL");
  const drawIdRef = useRef(0);
  const [lottery, setLottery] = useState<{ readonly phase: LotteryPhase; readonly digits: readonly [number, number, number]; readonly jackpot: boolean; readonly drawId: number }>({ phase: "IDLE", digits: [0, 0, 0], jackpot: false, drawId: 0 });
  const [holds, setHolds] = useState(0);
  const [debug, setDebugState] = useState<DebugDrawOptions>(DEFAULT_DEBUG_DRAW);
  const [stats, setStats] = useState<RuntimeStats>({ fps: 0, physicsHz: board.physics.physicsHz, stepMs: 0, activeBalls: 0, launched: 0, start: 0, out: 0, through: 0, electricSupport: 0, attacker: 0 });

  controlsRef.current = controls;
  debugRef.current = debug;

  useEffect(() => {
    let cancelled = false;
    let animationFrame = 0;
    let lastFrame = performance.now();
    let lastStats = lastFrame;
    let frames = 0;
    const host = hostRef.current;
    if (host === null) return;
    const start = async () => {
      const engine = await PachinkoPhysicsEngine.create({ board, seed: 123456, ccdEnabled: controlsRef.current.ccd });
      if (cancelled) { engine.dispose(); return; }
      const renderer = new PixiBoardRenderer(board);
      await renderer.mount(host, debugRef.current);
      if (cancelled) { renderer.destroy(); engine.dispose(); return; }
      engineRef.current = engine;
      rendererRef.current = renderer;
      countsRef.current = { launched: 0, start: 0, out: 0, through: 0, electricSupport: 0, attacker: 0 };
      audioRef.current = new PlayAudio();
      holdQueueRef.current = []; lotteryBusyRef.current = false; setHolds(0);
      const playLottery = (rawState: number): void => {
        lotteryBusyRef.current = true;
        const state = rawState >>> 0;
        const jackpot = state % 319 === 0;
        const drawId = ++drawIdRef.current;
        const digits: [number, number, number] = jackpot ? [7, 7, 7] : [state % 10, (state >>> 8) % 10, (state >>> 16) % 10];
        lotteryTimersRef.current.forEach(window.clearTimeout); lotteryTimersRef.current = [];
        const update = (phase: LotteryPhase, nextDigits = digits) => setLottery({ phase, digits: nextDigits, jackpot, drawId });
        update("CHANCE", [state % 10, (state >>> 4) % 10, (state >>> 12) % 10]);
        audioRef.current?.storyAlarm();
        lotteryTimersRef.current.push(window.setTimeout(() => { update("REACH", [digits[0], (digits[1] + 3) % 10, digits[2]]); audioRef.current?.storyLaunch(); }, 1500));
        lotteryTimersRef.current.push(window.setTimeout(() => audioRef.current?.storyImpact(), 3000));
        lotteryTimersRef.current.push(window.setTimeout(() => audioRef.current?.storySync(), 3900));
        lotteryTimersRef.current.push(window.setTimeout(() => { audioRef.current?.silence(420); update("FREEZE"); }, 4875));
        lotteryTimersRef.current.push(window.setTimeout(() => { update("RESULT"); audioRef.current?.storyStrike(); }, 5300));
        if (jackpot) lotteryTimersRef.current.push(window.setTimeout(() => {
          update("JACKPOT"); audioRef.current?.kyuin();
          phaseRef.current = "RUSH"; rushShotsRef.current = 100; setPhase("RUSH"); audioRef.current?.rush();
        }, 5650));
        const finishAfter = 6200;
        lotteryTimersRef.current.push(window.setTimeout(() => {
          setLottery({ phase: "IDLE", digits, jackpot, drawId });
          const next = holdQueueRef.current.shift(); setHolds(holdQueueRef.current.length);
          if (next === undefined) lotteryBusyRef.current = false;
          else playLottery(next);
        }, finishAfter));
      };
      engine.events.on("ball.launched", () => {
        countsRef.current.launched += 1; audioRef.current?.launch();
        if (phaseRef.current === "RUSH" && --rushShotsRef.current <= 0) {
          phaseRef.current = "NORMAL"; setPhase("NORMAL"); audioRef.current?.normal();
        }
      });
      engine.events.on("nail.hit", () => audioRef.current?.nail());
      engine.events.on("sensor.enter", (event) => {
        if (event.role === "START") {
          countsRef.current.start += 1; audioRef.current?.pocket();
          if (phaseRef.current === "NORMAL") {
            let state = lotteryStateRef.current; state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
            lotteryStateRef.current = state >>> 0;
            if (lotteryBusyRef.current) {
              if (holdQueueRef.current.length < 4) { holdQueueRef.current.push(lotteryStateRef.current); setHolds(holdQueueRef.current.length); }
            } else playLottery(lotteryStateRef.current);
          }
        }
        if (event.role === "OUT") { countsRef.current.out += 1; audioRef.current?.out(); }
        if (event.role === "THROUGH") countsRef.current.through += 1;
        if (event.role === "ELECTRIC_SUPPORT") countsRef.current.electricSupport += 1;
        if (event.role === "ATTACKER") countsRef.current.attacker += 1;
      });
      const accumulator = new FixedTimestepAccumulator({ fixedDt: engine.fixedDt, maxStepsPerFrame: 960 });
      const frame = (now: number) => {
        const wallDelta = (now - lastFrame) / 1000;
        lastFrame = now;
        const current = controlsRef.current;
        engine.setCcdEnabled(current.ccd);
        const alpha = accumulator.advance(wallDelta, current.simulationSpeed, () => {
          if (current.autoFire) {
            const interval = Math.round(engine.physicsHz * 60 / current.fireRate);
            if (engine.tick - lastAutoTickRef.current >= interval) {
              engine.schedule({ type: "launch", tick: engine.tick, sequence: sequenceRef.current++, power: phaseRef.current === "RUSH" ? 1 : 0.68 });
              lastAutoTickRef.current = engine.tick;
            }
          }
          engine.step();
        });
        renderer.render(engine.snapshot(), alpha, debugRef.current);
        frames += 1;
        if (now - lastStats >= 500) {
          const diagnostics = engine.diagnostics();
          setStats({ fps: frames * 1000 / (now - lastStats), physicsHz: engine.physicsHz, stepMs: diagnostics.lastStepDurationMs, activeBalls: diagnostics.activeBallCount, ...countsRef.current });
          frames = 0;
          lastStats = now;
        }
        animationFrame = requestAnimationFrame(frame);
      };
      animationFrame = requestAnimationFrame(frame);
    };
    void start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      rendererRef.current?.destroy();
      engineRef.current?.dispose();
      rendererRef.current = null;
      engineRef.current = null;
      lotteryTimersRef.current.forEach(window.clearTimeout);
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, [board]);

  const fire = useCallback(() => {
    const engine = engineRef.current;
    if (engine === null) return;
    audioRef.current?.unlock();
    engine.schedule({ type: "launch", tick: engine.tick, sequence: sequenceRef.current++, power: phaseRef.current === "RUSH" ? 1 : 0.68 });
  }, []);

  const setDebug = useCallback((key: keyof DebugDrawOptions, value: boolean) => {
    setDebugState((current) => ({ ...current, [key]: value }));
  }, []);

  return { hostRef, fire, debug, setDebug, stats, phase, rushShots: rushShotsRef.current, lottery, holds, snapshot: engineRef.current?.snapshot() ?? EMPTY };
}
