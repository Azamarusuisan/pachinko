import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { parseBoard, type BoardDefinition } from "@pachinko/board-schema";
import type { SimulationMetrics } from "@pachinko/simulation-runner";
import prototypeJson from "../../../boards/prototype/eva15_inspired_physics_v1.json";
import { CalibrationEditor } from "./CalibrationEditor.js";
import { ControlPanel } from "./ControlPanel.js";
import { useSimulation, type SimulationControls } from "./useSimulation.js";
import { StorySequence } from "./StorySequence.js";

const initialBoard = parseBoard(prototypeJson);
const LEFT_POWER = 0.68;
const RIGHT_POWER = 1;
const initialControls: SimulationControls = { power: LEFT_POWER, fireRate: 100, simulationSpeed: 1, ccd: true, autoFire: false };
const LOTTERY_COPY = {
  IDLE: ["", ""], CHANCE: ["前兆発生", "何かが起きる"], REACH: ["リーチ", "決着の瞬間を待て"],
  FREEZE: ["……", "静寂"], RESULT: ["決着", "数字停止"], JACKPOT: ["大当り", "RUSH突入・右打ち"],
} as const;

export function App() {
  const [board, setBoardRaw] = useState<BoardDefinition>(initialBoard);
  const [controls, setControls] = useState(initialControls);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [labMode, setLabMode] = useState(false);
  const [batchStatus, setBatchStatus] = useState("Ready");
  const [batchWorker, setBatchWorker] = useState<Worker | null>(null);
  const [previousMetrics, setPreviousMetrics] = useState<SimulationMetrics | null>(null);
  const simulation = useSimulation(board, { ...controls, autoFire: controls.autoFire || spaceHeld });
  const setBoard = useCallback((candidate: BoardDefinition) => {
    try { setBoardRaw(parseBoard(candidate)); setBatchStatus("Board validated; world recreated."); }
    catch (error) { setBatchStatus(error instanceof Error ? error.message : "Invalid board JSON"); }
  }, []);
  const run = useCallback((balls: number) => {
    batchWorker?.terminate();
    setBatchStatus(`Running ${balls} balls headless…`);
    const worker = new Worker(new URL("./simulation.worker.ts", import.meta.url), { type: "module" });
    setBatchWorker(worker);
    worker.onmessage = (event: MessageEvent<{ ok: boolean; metrics?: SimulationMetrics; error?: string }>) => {
      if (event.data.ok && event.data.metrics !== undefined) {
        const metrics = event.data.metrics;
        const comparable = previousMetrics?.ballsLaunched === metrics.ballsLaunched && previousMetrics.seed === metrics.seed;
        const comparison = comparable && previousMetrics !== null ? {
          startRateDelta: metrics.startRate - previousMetrics.startRate,
          averageLifetimeDelta: metrics.averageLifetime - previousMetrics.averageLifetime,
          averageCollisionCountDelta: metrics.averageCollisionCount - previousMetrics.averageCollisionCount,
          leftRouteRateDelta: metrics.leftRouteRate - previousMetrics.leftRouteRate,
          centerRouteRateDelta: metrics.centerRouteRate - previousMetrics.centerRouteRate,
          rightRouteRateDelta: metrics.rightRouteRate - previousMetrics.rightRouteRate,
        } : "Run the same ball count again after calibration to compare.";
        setBatchStatus(JSON.stringify({ metrics, comparisonToPrevious: comparison }, null, 2));
        setPreviousMetrics(metrics);
      } else setBatchStatus(event.data.error ?? "Simulation failed");
      worker.terminate(); setBatchWorker(null);
    };
    worker.postMessage({ board, balls, seed: 123456, launchPower: controls.power, fireRate: controls.fireRate, ccdEnabled: controls.ccd });
  }, [batchWorker, board, controls, previousMetrics]);
  useEffect(() => () => batchWorker?.terminate(), [batchWorker]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => { if (event.code === "Space") { event.preventDefault(); setSpaceHeld(true); } };
    const up = (event: KeyboardEvent) => { if (event.code === "Space") setSpaceHeld(false); };
    const blur = () => setSpaceHeld(false);
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, []);
  const panel = useMemo(() => <><ControlPanel controls={controls} onControls={setControls} fire={simulation.fire} debug={simulation.debug} onDebug={simulation.setDebug} stats={simulation.stats} onBatch={run} batchStatus={batchStatus}/><CalibrationEditor board={board} onBoard={setBoard}/></>, [batchStatus, board, controls, run, setBoard, simulation]);
  return <main className={`shell ${labMode ? "lab-mode" : "play-mode"}`}>
    <header className="play-header"><div><p className="eyebrow">REFERENCE PLAY / EVA-15 TYPE</p><h1>未来型パチンコ シミュレーター</h1></div><div className="header-actions"><span className={`mode-chip ${simulation.phase === "RUSH" ? "rush" : ""}`}>{simulation.phase === "RUSH" ? "RUSH・右打ち" : "通常・左打ち"}</span><button aria-label="Controls" onClick={() => { setLabMode(!labMode); setDrawer(!labMode); }}>{labMode ? "遊技へ戻る" : "メニュー"}</button></div></header>
    <div className="play-data" aria-label="遊技データ">
      <div><small>発射</small><strong>{simulation.stats.launched}</strong></div><div><small>ヘソ</small><strong>{simulation.stats.start}</strong></div><div><small>保留</small><strong>{simulation.holds}/4</strong></div><div><small>スルー</small><strong>{simulation.stats.through}</strong></div><div><small>電チュー</small><strong>{simulation.stats.electricSupport}</strong></div><div><small>アタッカー</small><strong>{simulation.stats.attacker}</strong></div><div><small>OUT</small><strong>{simulation.stats.out}</strong></div>
    </div>
    <div className="layout"><section className="machine"><div className="machine-top"><span>PHYSICAL PLAYFIELD</span><i>REFERENCE MODEL 15</i></div><div className="cabinet-stage">
      <img className="cabinet-art" src="/assets/eva15-reference-cabinet-v2.png" alt="現代日本機の構造を参考にした独自意匠のパチンコ筐体"/>
      <div className="board-canvas" ref={simulation.hostRef}/>
      <div className={`effect-scene ${simulation.lottery.phase.toLowerCase()} ${simulation.phase === "RUSH" && simulation.lottery.phase === "IDLE" ? "rush" : ""}`}>{simulation.lottery.phase !== "IDLE" && <StorySequence drawId={simulation.lottery.drawId} jackpot={simulation.lottery.jackpot}/>}<div className="generated-sequence"/></div>
      <div className={`lottery-display ${simulation.lottery.phase !== "IDLE" ? "active" : ""}`}>{simulation.lottery.digits.map((digit, index) => <i key={`${index}-${digit}`} style={{ "--digit-position": `${digit * 11.111}%` } as CSSProperties}/>)}</div>
      <div className={`effect-subtitle ${simulation.lottery.phase.toLowerCase()}`}><b>{LOTTERY_COPY[simulation.lottery.phase][0]}</b><span>{LOTTERY_COPY[simulation.lottery.phase][1]}</span></div>
      <div className="hold-lamps" aria-label={`保留 ${simulation.holds}`}><i className="current"/>{[0, 1, 2, 3].map((index) => <i key={index} className={index < simulation.holds ? "filled" : ""}/>)}</div>
      <div className="screen-overlay"><small>REFERENCE PLAY</small><strong>{simulation.phase === "RUSH" ? "右打ち RUSH" : "通常遊技・左打ち"}</strong><span>{simulation.phase === "RUSH" ? `RUSH ${simulation.rushShots}` : controls.autoFire ? "AUTO PLAY" : "HANDLE READY"}</span></div>
    </div><div className="machine-console"><button className={`auto-button ${controls.autoFire ? "active" : ""}`} onClick={() => setControls({ ...controls, autoFire: !controls.autoFire })}><small>オート</small>{controls.autoFire ? "停止" : "開始"}</button><div className="shot-modes" aria-label="遊技状態"><button aria-pressed={simulation.phase === "NORMAL"} disabled>通常・左</button><button aria-pressed={simulation.phase === "RUSH"} disabled>RUSH・右</button></div><label className="quick-power"><span>ハンドル</span><input aria-label="Launch Power" type="range" min="0" max="1" step="0.01" value={simulation.phase === "RUSH" ? RIGHT_POWER : LEFT_POWER} disabled/><output>{simulation.phase === "RUSH" ? 100 : 68}</output></label><button className="handle" onClick={simulation.fire} aria-label="玉を一発発射"><span>発射</span></button></div></section>{labMode && <div className={`side ${drawer ? "open" : ""}`}>{panel}</div>}{labMode && drawer && <button className="backdrop" aria-label="Close controls" onClick={() => setDrawer(false)}/>}</div>
  </main>;
}
