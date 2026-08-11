import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { parseBoard, type BoardDefinition } from "@pachinko/board-schema";
import type { SimulationMetrics } from "@pachinko/simulation-runner";
import prototypeJson from "../../../boards/prototype/eva15_inspired_physics_v1.json";
import { CalibrationEditor } from "./CalibrationEditor.js";
import { ControlPanel } from "./ControlPanel.js";
import { LotteryPresentation } from "./LotteryPresentation.js";
import { SmoothnessHarness } from "./SmoothnessHarness.js";
import { useSimulation, type SimulationControls } from "./useSimulation.js";

const initialBoard = parseBoard(prototypeJson);
const LEFT_POWER = initialBoard.launcher.strength;
const RIGHT_POWER = 1;
const HOLD_COLOR_LABEL = { blue: "青", green: "緑", red: "赤", rainbow: "虹" } as const;
const initialControls: SimulationControls = { power: LEFT_POWER, fireRate: 100, simulationSpeed: 1, ccd: initialBoard.physics.ccdEnabled, autoFire: false };
const HARNESS_ENABLED = new URLSearchParams(window.location.search).get("harness") === "lottery";

function centerDisplayStyle(board: BoardDefinition): CSSProperties {
  const display = board.mechanisms.find((mechanism) => mechanism.id === "center-display-collider");
  if (display === undefined || display.colliders.length === 0) return {};
  const points = display.colliders.flatMap((collider) => [collider.from, collider.to]);
  const left = Math.min(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const right = Math.max(...points.map((point) => point.x));
  const bottom = Math.max(...points.map((point) => point.y));
  const percent = (value: number, total: number) => `${value / total * 100}%`;
  return {
    "--lcd-left": percent(left, board.board.width),
    "--lcd-top": percent(top, board.board.height),
    "--lcd-width": percent(right - left, board.board.width),
    "--lcd-height": percent(bottom - top, board.board.height),
  } as CSSProperties;
}

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
  const boardPlaneStyle = useMemo(() => centerDisplayStyle(board), [board]);
  const unlockAudio = simulation.unlockAudio;
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
    const down = (event: KeyboardEvent) => { if (event.code === "Space") { event.preventDefault(); unlockAudio(); setSpaceHeld(true); } };
    const up = (event: KeyboardEvent) => { if (event.code === "Space") setSpaceHeld(false); };
    const blur = () => setSpaceHeld(false);
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [unlockAudio]);
  const panel = useMemo(() => <><ControlPanel controls={controls} onControls={setControls} fire={simulation.fire} unlockAudio={simulation.unlockAudio} debug={simulation.debug} onDebug={simulation.setDebug} stats={simulation.stats} onBatch={run} batchStatus={batchStatus}/><CalibrationEditor board={board} onBoard={setBoard}/></>, [batchStatus, board, controls, run, setBoard, simulation]);
  return <main className={`shell ${labMode ? "lab-mode" : "play-mode"}`}>
    <header className="play-header"><div><p className="eyebrow">ORIGINAL PHYSICS GAUGE</p><h1>未来型パチンコ シミュレーター</h1></div><div className="header-actions"><span className={`mode-chip ${simulation.phase === "RUSH" ? "rush" : ""}`}>{simulation.phase === "RUSH" ? "RUSH・右打ち" : "通常・左打ち"}</span><button aria-label="Controls" onClick={() => { setLabMode(!labMode); setDrawer(!labMode); }}>{labMode ? "遊技へ戻る" : "メニュー"}</button></div></header>
    <div className="play-data" aria-label="遊技データ">
      <div><small>発射</small><strong>{simulation.stats.launched}</strong></div><div><small>ヘソ</small><strong>{simulation.stats.start}</strong></div><div><small>保留</small><strong>{simulation.holds}/4</strong></div><div><small>スルー</small><strong>{simulation.stats.through}</strong></div><div><small>電チュー</small><strong>{simulation.stats.electricSupport}</strong></div><div><small>アタッカー</small><strong>{simulation.stats.attacker}</strong></div><div><small>OUT</small><strong>{simulation.stats.out}</strong></div>
    </div>
    <div className="layout"><section className="machine"><div className="machine-top"><span>PHYSICAL PLAYFIELD</span><i>ORIGINAL CABINET 01</i></div><div className="cabinet-stage">
      <img className="cabinet-art" src="/assets/original-pachinko-cabinet-shell-v1.png" alt="黒クロームと発光導光板で構成したオリジナルのパチンコ筐体"/>
      <div className="board-plane" style={boardPlaneStyle}>
        <div className="board-canvas" ref={simulation.hostRef}/>
        <LotteryPresentation presentation={simulation.lottery} rush={simulation.phase === "RUSH"} onPush={simulation.pushLottery} readClock={simulation.readLotteryClock}/>
        <div className="hold-lamps" aria-label={`現在 ${simulation.lottery.phase === "IDLE" ? "なし" : HOLD_COLOR_LABEL[simulation.lottery.holdColor]}、保留 ${simulation.holdColors.map((color) => HOLD_COLOR_LABEL[color]).join("・") || "なし"}`}>
          <i className={simulation.lottery.phase === "IDLE" ? "current" : `current ${simulation.lottery.holdColor}`}/>
          {[0, 1, 2, 3].map((index) => <i key={index} className={simulation.holdColors[index] ?? ""}/>)}</div>
        <div className="screen-overlay"><small>PHYSICS LIVE</small><strong>{simulation.phase === "RUSH" ? "右打ち RUSH" : "通常遊技・左打ち"}</strong><span>{simulation.phase === "RUSH" ? `RUSH ${simulation.rushShots}` : controls.autoFire ? "AUTO PLAY" : "HANDLE READY"}</span></div>
      </div>
    </div><div className="machine-console"><button className={`auto-button ${controls.autoFire ? "active" : ""}`} onClick={() => { unlockAudio(); setControls({ ...controls, autoFire: !controls.autoFire }); }}><small>オート</small>{controls.autoFire ? "停止" : "開始"}</button><div className="shot-modes" aria-label="遊技状態"><button aria-pressed={simulation.phase === "NORMAL"} disabled>通常・左</button><button aria-pressed={simulation.phase === "RUSH"} disabled>RUSH・右</button></div><label className="quick-power"><span>ハンドル</span><input aria-label="Launch Power" type="range" min="0" max="1" step="0.01" value={simulation.phase === "RUSH" ? RIGHT_POWER : controls.power} disabled/><output>{Math.round((simulation.phase === "RUSH" ? RIGHT_POWER : controls.power) * 100)}</output></label><button className="handle" onClick={simulation.fire} aria-label="玉を一発発射"><span>発射</span></button></div></section>{labMode && <div className={`side ${drawer ? "open" : ""}`}>{panel}</div>}{labMode && drawer && <button className="backdrop" aria-label="Close controls" onClick={() => setDrawer(false)}/>}</div>
    {HARNESS_ENABLED && <SmoothnessHarness presentation={simulation.lottery} physicsStepMs={simulation.stats.stepMs} trigger={simulation.triggerLottery} push={simulation.pushLottery} readClock={simulation.readLotteryClock}/>}
  </main>;
}
