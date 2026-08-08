import type { BoardDefinition } from "@pachinko/board-schema";
import { type SimulationSnapshot } from "@pachinko/physics-core";
import { type DebugDrawOptions } from "@pachinko/renderer-pixi";
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
export declare function useSimulation(board: BoardDefinition, controls: SimulationControls): {
    hostRef: import("react").RefObject<HTMLDivElement | null>;
    fire: () => void;
    debug: DebugDrawOptions;
    setDebug: (key: keyof DebugDrawOptions, value: boolean) => void;
    stats: RuntimeStats;
    phase: PlayPhase;
    rushShots: number;
    lottery: {
        readonly phase: LotteryPhase;
        readonly digits: readonly [number, number, number];
        readonly jackpot: boolean;
        readonly drawId: number;
    };
    holds: number;
    snapshot: SimulationSnapshot;
};
//# sourceMappingURL=useSimulation.d.ts.map