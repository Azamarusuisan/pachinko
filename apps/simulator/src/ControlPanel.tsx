import type { DebugDrawOptions } from "@pachinko/renderer-pixi";
import type { RuntimeStats, SimulationControls } from "./useSimulation.js";

interface Props {
  readonly controls: SimulationControls;
  readonly onControls: (next: SimulationControls) => void;
  readonly fire: () => void;
  readonly unlockAudio: () => void;
  readonly debug: DebugDrawOptions;
  readonly onDebug: (key: keyof DebugDrawOptions, value: boolean) => void;
  readonly stats: RuntimeStats;
  readonly onBatch: (balls: number) => void;
  readonly batchStatus: string;
}

const label: Record<keyof DebugDrawOptions, string> = {
  colliders: "Collider", sensors: "Sensor", velocityVectors: "Velocity Vector",
  angularVelocity: "Angular Velocity", collisionNormals: "Collision Normal",
  collisionPoints: "Collision Point", ballTrails: "Ball Trail", ballIds: "Ball ID", nailIds: "Nail ID",
};

export function ControlPanel({ controls, onControls, fire, unlockAudio, debug, onDebug, stats, onBatch, batchStatus }: Props) {
  const update = <K extends keyof SimulationControls>(key: K, value: SimulationControls[K]) => onControls({ ...controls, [key]: value });
  return <aside className="panel" aria-label="Debug and calibration panel">
    <section><h2>発射ハンドル</h2>
      <label>発射強度 <output>{controls.power.toFixed(2)}</output><input aria-label="Launch Power" type="range" min="0" max="1" step="0.01" value={controls.power} onChange={(event) => update("power", Number(event.target.value))}/></label>
      <label>発射レート<select value={controls.fireRate} onChange={(event) => update("fireRate", Number(event.target.value) as SimulationControls["fireRate"])}>{[25,50,75,100].map((rate) => <option key={rate} value={rate}>{rate} balls/min{rate === 100 ? " (REALISTIC)" : ""}</option>)}</select></label>
      <div className="button-row"><button onClick={fire}>Fire</button><button className={controls.autoFire ? "active" : ""} onClick={() => { unlockAudio(); update("autoFire", !controls.autoFire); }}>{controls.autoFire ? "オート停止" : "オート開始"}</button></div>
    </section>
    <section><h2>シミュレーション</h2>
      <label>Speed<select value={controls.simulationSpeed} onChange={(event) => update("simulationSpeed", Number(event.target.value) as SimulationControls["simulationSpeed"])}>{[1,2,4,8,16].map((speed) => <option key={speed} value={speed}>{speed}x</option>)}</select></label>
      <label className="toggle"><input type="checkbox" checked={controls.ccd} onChange={(event) => update("ccd", event.target.checked)}/> CCD</label>
      <div className="metrics"><span>FPS {stats.fps.toFixed(1)}</span><span>Physics {stats.physicsHz} Hz</span><span>Step {stats.stepMs.toFixed(3)} ms</span><span>Active {stats.activeBalls}</span><span>Launched {stats.launched}</span><span>START pocket {stats.start}</span><span>Accepted {stats.acceptedStarts}</span><span>Overflow {stats.overflowStarts}</span><span>OUT {stats.out}</span></div>
    </section>
    <section><h2>デバッグ表示</h2><div className="checks">{(Object.keys(debug) as Array<keyof DebugDrawOptions>).map((key) => <label className="toggle" key={key}><input type="checkbox" checked={debug[key]} onChange={(event) => onDebug(key, event.target.checked)}/>{label[key]}</label>)}</div></section>
    <section><h2>自動発射テスト</h2><div className="button-row tests">{[100,1000,10000].map((count) => <button key={count} onClick={() => onBatch(count)}>{count} BALL TEST</button>)}</div><pre className="status">{batchStatus}</pre></section>
  </aside>;
}
