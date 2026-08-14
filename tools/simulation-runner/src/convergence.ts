import type { BoardDefinition } from "@pachinko/board-schema";
import { runBatch, type SimulationMetrics } from "./index.js";

export const CONVERGENCE_GATES = {
  startOutPercentagePoints: 0.3,
  meanRelativePercent: 2,
  timeoutRate: 0.0001,
  remainingBodies: 0,
  velocityClampCount: 0,
} as const;

const NORMAL_95_Z = 1.959963984540054;
const RATE_MARGIN = CONVERGENCE_GATES.startOutPercentagePoints / 100;

export const RATE_UNCERTAINTY = {
  method: "UNPOOLED_NORMAL_95" as const,
  confidenceLevel: 0.95,
  /** Worst-case planning estimate for a 95% two-sample CI half-width no larger than the point gate. */
  worstCaseBallsPerResolutionForGateWidth: Math.ceil(2 * 0.25 * (NORMAL_95_Z / RATE_MARGIN) ** 2),
} as const;

export type RateEvidenceClassification = "CONFIRMED_WITHIN_GATE" | "CONFIRMED_OUTSIDE_GATE" | "INCONCLUSIVE";

export interface RateDifferenceUncertainty {
  readonly deltaPercentagePoints: number;
  readonly standardErrorPercentagePoints: number;
  readonly confidence95PercentagePoints: {
    readonly lower: number;
    readonly upper: number;
  };
  /** False when the normal approximation has fewer than 10 expected successes or failures in either sample. */
  readonly normalApproximationAdequate: boolean;
  readonly classification: RateEvidenceClassification;
}

export interface ConvergenceSnapshot {
  readonly totalBalls: number;
  readonly startRate: number;
  readonly outRate: number;
  readonly averageLifetime: number;
  readonly averageCollisionCount: number;
  readonly averageVelocity: number;
  readonly maxVelocity: number;
  readonly timeoutCount: number;
  readonly timeoutRate: number;
  readonly remainingBodies: number;
  readonly velocityClampCount: number;
  readonly finite: boolean;
}

export interface ConvergenceEvaluation {
  readonly baseline: ConvergenceSnapshot;
  readonly refined: ConvergenceSnapshot;
  readonly deltas: {
    readonly startRatePercentagePoints: number;
    readonly outRatePercentagePoints: number;
    readonly averageLifetimeRelativePercent: number | null;
    readonly averageCollisionCountRelativePercent: number | null;
    readonly averageVelocityRelativePercent: number | null;
    readonly maxVelocityMetersPerSecond: number;
  };
  readonly checks: {
    readonly startRate: boolean;
    readonly outRate: boolean;
    readonly averageLifetime: boolean;
    readonly averageCollisionCount: boolean;
    readonly averageVelocity: boolean;
    readonly timeoutRate: boolean;
    readonly remainingBodies: boolean;
    readonly velocityClampCount: boolean;
    readonly finite: boolean;
  };
  /** Statistical evidence is diagnostic only; it never overrides the deterministic point gates in `checks`. */
  readonly rateUncertainty: {
    readonly method: typeof RATE_UNCERTAINTY.method;
    readonly confidenceLevel: typeof RATE_UNCERTAINTY.confidenceLevel;
    readonly worstCaseBallsPerResolutionForGateWidth: number;
    readonly startRate: RateDifferenceUncertainty;
    readonly outRate: RateDifferenceUncertainty;
  };
  readonly pass: boolean;
}

export interface ConvergenceResult extends ConvergenceEvaluation {
  readonly config: {
    readonly boardId: string;
    readonly boardVersion: string;
    readonly balls: number;
    readonly seed: number;
    readonly launchPower: number;
    readonly physicsHz: number;
    readonly baselineSubsteps: number;
    readonly refinedSubsteps: number;
    readonly resolutionChanged: boolean;
  };
  readonly gates: typeof CONVERGENCE_GATES;
}

function snapshot(metrics: SimulationMetrics): ConvergenceSnapshot {
  return {
    totalBalls: metrics.totalBalls,
    startRate: metrics.startRate,
    outRate: metrics.outRate,
    averageLifetime: metrics.averageLifetime,
    averageCollisionCount: metrics.averageCollisionCount,
    averageVelocity: metrics.averageVelocity,
    maxVelocity: metrics.maxVelocity,
    timeoutCount: metrics.timeoutCount,
    timeoutRate: metrics.totalBalls === 0 ? 0 : metrics.timeoutCount / metrics.totalBalls,
    remainingBodies: metrics.remainingBodies,
    velocityClampCount: metrics.velocityClampCount,
    finite: metrics.finite,
  };
}

function relativePercent(baseline: number, refined: number): number | null {
  if (baseline === 0) return refined === 0 ? 0 : null;
  return (refined - baseline) / Math.abs(baseline) * 100;
}

function rateDifferenceUncertainty(
  baselineRate: number,
  baselineBalls: number,
  refinedRate: number,
  refinedBalls: number,
): RateDifferenceUncertainty {
  const delta = refinedRate - baselineRate;
  const standardError = baselineBalls > 0 && refinedBalls > 0
    ? Math.sqrt(
      baselineRate * (1 - baselineRate) / baselineBalls
      + refinedRate * (1 - refinedRate) / refinedBalls,
    )
    : Number.POSITIVE_INFINITY;
  const lower = (delta - NORMAL_95_Z * standardError) * 100;
  const upper = (delta + NORMAL_95_Z * standardError) * 100;
  const adequateSample = (rate: number, balls: number) => (
    balls > 0 && balls * rate >= 10 && balls * (1 - rate) >= 10
  );
  const normalApproximationAdequate = adequateSample(baselineRate, baselineBalls)
    && adequateSample(refinedRate, refinedBalls);
  const margin = CONVERGENCE_GATES.startOutPercentagePoints;
  const classification: RateEvidenceClassification = !normalApproximationAdequate
    ? "INCONCLUSIVE"
    : lower >= -margin && upper <= margin
      ? "CONFIRMED_WITHIN_GATE"
      : lower > margin || upper < -margin
        ? "CONFIRMED_OUTSIDE_GATE"
        : "INCONCLUSIVE";
  return {
    deltaPercentagePoints: delta * 100,
    standardErrorPercentagePoints: standardError * 100,
    confidence95PercentagePoints: { lower, upper },
    normalApproximationAdequate,
    classification,
  };
}

export function evaluateConvergence(baseline: ConvergenceSnapshot, refined: ConvergenceSnapshot): ConvergenceEvaluation {
  const deltas = {
    startRatePercentagePoints: (refined.startRate - baseline.startRate) * 100,
    outRatePercentagePoints: (refined.outRate - baseline.outRate) * 100,
    averageLifetimeRelativePercent: relativePercent(baseline.averageLifetime, refined.averageLifetime),
    averageCollisionCountRelativePercent: relativePercent(baseline.averageCollisionCount, refined.averageCollisionCount),
    averageVelocityRelativePercent: relativePercent(baseline.averageVelocity, refined.averageVelocity),
    maxVelocityMetersPerSecond: refined.maxVelocity - baseline.maxVelocity,
  };
  const withinMeanGate = (value: number | null) => value !== null && Math.abs(value) <= CONVERGENCE_GATES.meanRelativePercent;
  const checks = {
    startRate: Math.abs(deltas.startRatePercentagePoints) <= CONVERGENCE_GATES.startOutPercentagePoints,
    outRate: Math.abs(deltas.outRatePercentagePoints) <= CONVERGENCE_GATES.startOutPercentagePoints,
    averageLifetime: withinMeanGate(deltas.averageLifetimeRelativePercent),
    averageCollisionCount: withinMeanGate(deltas.averageCollisionCountRelativePercent),
    averageVelocity: withinMeanGate(deltas.averageVelocityRelativePercent),
    timeoutRate: baseline.timeoutRate < CONVERGENCE_GATES.timeoutRate && refined.timeoutRate < CONVERGENCE_GATES.timeoutRate,
    remainingBodies: baseline.remainingBodies === CONVERGENCE_GATES.remainingBodies && refined.remainingBodies === CONVERGENCE_GATES.remainingBodies,
    velocityClampCount: baseline.velocityClampCount === CONVERGENCE_GATES.velocityClampCount && refined.velocityClampCount === CONVERGENCE_GATES.velocityClampCount,
    finite: baseline.finite && refined.finite,
  };
  const rateUncertainty = {
    ...RATE_UNCERTAINTY,
    startRate: rateDifferenceUncertainty(baseline.startRate, baseline.totalBalls, refined.startRate, refined.totalBalls),
    outRate: rateDifferenceUncertainty(baseline.outRate, baseline.totalBalls, refined.outRate, refined.totalBalls),
  };
  return { baseline, refined, deltas, checks, rateUncertainty, pass: Object.values(checks).every(Boolean) };
}

export async function runConvergence(options: {
  readonly board: BoardDefinition;
  readonly balls: number;
  readonly seed: number;
  readonly launchPower?: number;
}): Promise<ConvergenceResult> {
  const baselineSubsteps = options.board.physics.substeps;
  const refinedSubsteps = Math.min(32, baselineSubsteps * 2);
  const launchPower = options.launchPower ?? options.board.launcher.strength;
  const common = {
    board: options.board,
    balls: options.balls,
    seed: options.seed,
    launchPower,
    fireRate: 100 as const,
    physicsHz: options.board.physics.physicsHz,
    ccdEnabled: options.board.physics.ccdEnabled,
  };
  const baselineMetrics = await runBatch({ ...common, substeps: baselineSubsteps });
  const refinedMetrics = await runBatch({ ...common, substeps: refinedSubsteps });
  return {
    config: {
      boardId: options.board.id,
      boardVersion: options.board.version,
      balls: options.balls,
      seed: options.seed,
      launchPower,
      physicsHz: options.board.physics.physicsHz,
      baselineSubsteps,
      refinedSubsteps,
      resolutionChanged: refinedSubsteps !== baselineSubsteps,
    },
    gates: CONVERGENCE_GATES,
    ...evaluateConvergence(snapshot(baselineMetrics), snapshot(refinedMetrics)),
  };
}
