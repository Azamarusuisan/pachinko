import type { DebugDrawOptions } from "@pachinko/renderer-pixi";
import type { RuntimeStats, SimulationControls } from "./useSimulation.js";
interface Props {
    readonly controls: SimulationControls;
    readonly onControls: (next: SimulationControls) => void;
    readonly fire: () => void;
    readonly debug: DebugDrawOptions;
    readonly onDebug: (key: keyof DebugDrawOptions, value: boolean) => void;
    readonly stats: RuntimeStats;
    readonly onBatch: (balls: number) => void;
    readonly batchStatus: string;
}
export declare function ControlPanel({ controls, onControls, fire, debug, onDebug, stats, onBatch, batchStatus }: Props): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=ControlPanel.d.ts.map