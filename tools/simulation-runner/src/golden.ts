import type { SimulationMetrics } from "./index.js";

export interface GoldenTolerances {
  readonly startRate: number;
  readonly averageCollisionCount: number;
  readonly averageLifetime: number;
  readonly routeRate: number;
}

export interface GoldenBaseline {
  readonly scenario: {
    readonly boardId: "eva15_inspired_physics_v2";
    readonly boardVersion: string;
    readonly physicsVersion: string;
    readonly seed: 123456;
    readonly balls: 1000;
    readonly launchPower: 0.68;
    readonly fireRate: 100;
    readonly physicsHz: 240;
    readonly substeps: number;
    readonly ccdEnabled: true;
  };
  readonly measuredAt: string;
  readonly metrics: Pick<SimulationMetrics, "startRate" | "averageCollisionCount" | "averageLifetime" | "leftRouteRate" | "centerRouteRate" | "rightRouteRate">;
  readonly tolerances: GoldenTolerances;
}

export interface GoldenDifference { readonly metric: keyof GoldenBaseline["metrics"]; readonly expected: number; readonly actual: number; readonly delta: number; readonly tolerance: number }

export function compareGolden(actual: SimulationMetrics, baseline: GoldenBaseline): readonly GoldenDifference[] {
  const toleranceFor: Record<keyof GoldenBaseline["metrics"], number> = {
    startRate: baseline.tolerances.startRate,
    averageCollisionCount: baseline.tolerances.averageCollisionCount,
    averageLifetime: baseline.tolerances.averageLifetime,
    leftRouteRate: baseline.tolerances.routeRate,
    centerRouteRate: baseline.tolerances.routeRate,
    rightRouteRate: baseline.tolerances.routeRate,
  };
  return (Object.keys(baseline.metrics) as Array<keyof GoldenBaseline["metrics"]>).flatMap((metric) => {
    const expected = baseline.metrics[metric];
    const value = actual[metric];
    const tolerance = toleranceFor[metric];
    const delta = Math.abs(value - expected);
    return delta > tolerance ? [{ metric, expected, actual: value, delta, tolerance }] : [];
  });
}

export function createGoldenBaseline(metrics: SimulationMetrics, measuredAt: string): GoldenBaseline {
  if (metrics.boardId !== "eva15_inspired_physics_v2" || metrics.seed !== 123456 || metrics.ballsLaunched !== 1000 || metrics.launchPower !== 0.68 || metrics.fireRate !== 100 || metrics.physicsHz !== 240 || !metrics.ccdEnabled) {
    throw new Error("Metrics do not match the fixed golden scenario");
  }
  return {
    scenario: {
      boardId: "eva15_inspired_physics_v2", boardVersion: metrics.boardVersion, physicsVersion: metrics.physicsVersion,
      seed: 123456, balls: 1000, launchPower: 0.68, fireRate: 100, physicsHz: 240, substeps: metrics.substeps, ccdEnabled: true,
    },
    measuredAt,
    metrics: {
      startRate: metrics.startRate,
      averageCollisionCount: metrics.averageCollisionCount,
      averageLifetime: metrics.averageLifetime,
      leftRouteRate: metrics.leftRouteRate,
      centerRouteRate: metrics.centerRouteRate,
      rightRouteRate: metrics.rightRouteRate,
    },
    tolerances: { startRate: 0, averageCollisionCount: 0, averageLifetime: 0, routeRate: 0 },
  };
}
