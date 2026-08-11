import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardDefinition } from "@pachinko/board-schema";
import { createLaunchCommand, launcherConfigFromBoard } from "@pachinko/input-system";
import { FixedTimestepAccumulator, PachinkoPhysicsEngine, type SimulationSnapshot } from "@pachinko/physics-core";
import { PixiBoardRenderer, DEFAULT_DEBUG_DRAW, type DebugDrawOptions } from "@pachinko/renderer-pixi";
import { PlayAudio } from "./PlayAudio.js";
import {
  IDLE_PRESENTATION,
  LOTTERY_TIMING,
  RUSH_SHOTS,
  consumeLotteryStart,
  consumeRushShot,
  createLotteryOutcome,
  dequeueLotteryHold,
  lotteryElapsedAfterPush,
  lotteryElapsedAwaitingPush,
  lotteryAudioCueAllowed,
  lotteryFinishAt,
  lotteryPresentationAt,
  presentationKey,
  type LotteryOutcome,
  type LotteryAudioCueId,
  type LotteryPresentation,
  type LotteryClockSnapshot,
  type LotteryClockReader,
  type HoldColor,
  type PlayPhase,
} from "./lotteryTimeline.js";

export type { PlayPhase } from "./lotteryTimeline.js";

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

const EMPTY: SimulationSnapshot = { tick: 0, simulationTime: 0, balls: [], contacts: [], mechanisms: [] };

interface ActiveLottery {
  readonly outcome: LotteryOutcome;
  startedAt: number;
  pushed: boolean;
  readonly drawId: number;
  readonly playedCues: Set<string>;
  lastPresentationKey: string;
}

const INACTIVE_LOTTERY_CLOCK: LotteryClockSnapshot = { active: false, drawId: 0, elapsedMs: 0, pushed: false };

function lotteryClockSnapshot(active: ActiveLottery, now: number): LotteryClockSnapshot {
  const wallElapsed = Math.max(0, now - active.startedAt);
  return {
    active: true,
    drawId: active.drawId,
    elapsedMs: active.outcome.reach && !active.pushed ? lotteryElapsedAwaitingPush(wallElapsed) : wallElapsed,
    pushed: active.pushed,
  };
}

function scheduleConfiguredLaunch(engine: PachinkoPhysicsEngine, board: BoardDefinition, strength: number, sequence: number): void {
  engine.schedule(createLaunchCommand(launcherConfigFromBoard(board, strength), engine.tick, sequence));
}

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
  const activeLotteryRef = useRef<ActiveLottery | null>(null);
  const lastLotteryClockRef = useRef<LotteryClockSnapshot>(INACTIVE_LOTTERY_CLOCK);
  const playLotteryRef = useRef<((rawState: number, now?: number) => void) | null>(null);
  const holdQueueRef = useRef<number[]>([]);
  const lotteryBusyRef = useRef(false);
  const [phase, setPhase] = useState<PlayPhase>("NORMAL");
  const drawIdRef = useRef(0);
  const [lottery, setLottery] = useState<LotteryPresentation>(IDLE_PRESENTATION);
  const [holdColors, setHoldColors] = useState<HoldColor[]>([]);
  const [debug, setDebugState] = useState<DebugDrawOptions>(DEFAULT_DEBUG_DRAW);
  const [stats, setStats] = useState<RuntimeStats>({ fps: 0, physicsHz: board.physics.physicsHz, stepMs: 0, activeBalls: 0, launched: 0, start: 0, out: 0, through: 0, electricSupport: 0, attacker: 0 });

  controlsRef.current = controls;
  debugRef.current = debug;

  const readLotteryClock: LotteryClockReader = useCallback(() => {
    const active = activeLotteryRef.current;
    return active === null ? lastLotteryClockRef.current : lotteryClockSnapshot(active, performance.now());
  }, []);

  useEffect(() => {
    const audio = new PlayAudio();
    audioRef.current = audio;
    return () => { audio.dispose(); if (audioRef.current === audio) audioRef.current = null; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let animationFrame = 0;
    let lastFrame = performance.now();
    let lastStats = lastFrame;
    let frames = 0;
    activeLotteryRef.current = null;
    lastLotteryClockRef.current = INACTIVE_LOTTERY_CLOCK;
    playLotteryRef.current = null;
    holdQueueRef.current = [];
    lotteryBusyRef.current = false;
    setHoldColors([]);
    setLottery(IDLE_PRESENTATION);
    audioRef.current?.silence(0);
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
      lastAutoTickRef.current = -Infinity;
      countsRef.current = { launched: 0, start: 0, out: 0, through: 0, electricSupport: 0, attacker: 0 };
      const playLottery = (rawState: number, now = performance.now()): void => {
        lotteryBusyRef.current = true;
        const drawId = ++drawIdRef.current;
        const outcome = createLotteryOutcome(rawState);
        const presentation = lotteryPresentationAt(outcome, 0, drawId);
        activeLotteryRef.current = {
          outcome,
          startedAt: now,
          pushed: false,
          drawId,
          playedCues: new Set(),
          lastPresentationKey: presentationKey(presentation),
        };
        setLottery(presentation);
        if (lotteryAudioCueAllowed(outcome, "storyAlarm")) audioRef.current?.storyAlarm();
      };
      playLotteryRef.current = playLottery;
      const advanceLottery = (now: number): void => {
        const active = activeLotteryRef.current;
        if (active === null) return;
        const clock = lotteryClockSnapshot(active, now);
        const elapsed = clock.elapsedMs;
        const cue = (name: LotteryAudioCueId | "freeze", at: number, action: () => void): void => {
          if (name !== "freeze" && !lotteryAudioCueAllowed(active.outcome, name)) return;
          if (elapsed < at || active.playedCues.has(name)) return;
          active.playedCues.add(name);
          action();
        };
        if (active.outcome.reach) {
          cue("storyLaunch", LOTTERY_TIMING.reach, () => audioRef.current?.storyLaunch());
          cue("hotAlert", LOTTERY_TIMING.hot, () => audioRef.current?.hotAlert());
          cue("storyImpact", LOTTERY_TIMING.impact, () => audioRef.current?.storyImpact());
          cue("storySync", LOTTERY_TIMING.sync, () => audioRef.current?.storySync());
          cue("freeze", LOTTERY_TIMING.freeze, () => audioRef.current?.silence(Number.POSITIVE_INFINITY));
          cue("storyStrike", LOTTERY_TIMING.result, () => audioRef.current?.storyStrike());
        }
        cue("kyuin", LOTTERY_TIMING.jackpot, () => audioRef.current?.kyuin());
        cue("rush", LOTTERY_TIMING.jackpot, () => {
          phaseRef.current = "RUSH"; rushShotsRef.current = RUSH_SHOTS; setPhase("RUSH"); audioRef.current?.rush();
        });
        const presentation = lotteryPresentationAt(active.outcome, elapsed, active.drawId);
        const key = presentationKey(presentation);
        if (key !== active.lastPresentationKey) {
          active.lastPresentationKey = key;
          setLottery(presentation);
        }
        if (elapsed < lotteryFinishAt(active.outcome)) return;
        const queued = dequeueLotteryHold(holdQueueRef.current);
        holdQueueRef.current = [...queued.holds];
        const next = queued.next;
        setHoldColors(queued.holds.map((state) => createLotteryOutcome(state).holdColor));
        if (next === undefined) {
          lastLotteryClockRef.current = { ...clock, active: false };
          activeLotteryRef.current = null;
          lotteryBusyRef.current = false;
        } else playLottery(next, now);
      };
      engine.events.on("ball.launched", (event) => {
        countsRef.current.launched += 1; audioRef.current?.launch(Math.hypot(event.velocity.x, event.velocity.y));
        const rush = consumeRushShot(phaseRef.current, rushShotsRef.current);
        rushShotsRef.current = rush.remainingShots;
        if (rush.phase !== phaseRef.current) {
          phaseRef.current = rush.phase; setPhase(rush.phase); audioRef.current?.normal();
        }
      });
      engine.events.on("nail.hit", (event) => audioRef.current?.nail(event.speedBefore));
      engine.events.on("sensor.enter", (event) => {
        if (event.role === "START") {
          countsRef.current.start += 1; audioRef.current?.pocket();
          const transition = consumeLotteryStart(lotteryStateRef.current, phaseRef.current, lotteryBusyRef.current, holdQueueRef.current);
          lotteryStateRef.current = transition.randomState;
          holdQueueRef.current = [...transition.holds];
          if (transition.disposition === "held") setHoldColors(transition.holds.map((state) => createLotteryOutcome(state).holdColor));
          if (transition.drawNow !== undefined) playLottery(transition.drawNow);
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
              scheduleConfiguredLaunch(engine, board, phaseRef.current === "RUSH" ? 1 : current.power, sequenceRef.current++);
              lastAutoTickRef.current = engine.tick;
            }
          }
          engine.step();
        });
        renderer.render(engine.snapshot(), alpha, debugRef.current);
        advanceLottery(now);
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
      activeLotteryRef.current = null;
      playLotteryRef.current = null;
    };
  }, [board]);

  const fire = useCallback(() => {
    const engine = engineRef.current;
    if (engine === null) return;
    audioRef.current?.unlock();
    scheduleConfiguredLaunch(engine, board, phaseRef.current === "RUSH" ? 1 : controlsRef.current.power, sequenceRef.current++);
  }, [board]);

  const unlockAudio = useCallback(() => audioRef.current?.unlock(), []);

  const pushLottery = useCallback(() => {
    const active = activeLotteryRef.current;
    if (active === null || active.pushed || !active.outcome.reach) return;
    const now = performance.now();
    const elapsed = lotteryElapsedAwaitingPush(now - active.startedAt);
    if (elapsed < LOTTERY_TIMING.freeze) return;
    audioRef.current?.unlock();
    audioRef.current?.silence(0);
    active.pushed = true;
    active.startedAt = now - lotteryElapsedAfterPush(elapsed);
  }, []);

  const setDebug = useCallback((key: keyof DebugDrawOptions, value: boolean) => {
    setDebugState((current) => ({ ...current, [key]: value }));
  }, []);

  const triggerLottery = useCallback((rawState: number) => {
    const playLottery = playLotteryRef.current;
    if (playLottery === null) return false;
    playLottery(rawState);
    return true;
  }, []);

  return { hostRef, fire, unlockAudio, pushLottery, triggerLottery, readLotteryClock, debug, setDebug, stats, phase, rushShots: rushShotsRef.current, lottery, holds: holdColors.length, holdColors, snapshot: engineRef.current?.snapshot() ?? EMPTY };
}
