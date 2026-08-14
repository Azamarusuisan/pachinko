import { parseBoard, type BoardDefinition } from "@pachinko/board-schema";
import { z } from "zod";

export type PhysicsHz = 120 | 240 | 480;
export type FireRate = 25 | 50 | 75 | 100;
export type SimulationSpeed = 1 | 2 | 4 | 8 | 16;

export interface CalibrationPatch {
  readonly gravity?: number;
  readonly gravityScale?: number;
  readonly ballMassGrams?: number;
  readonly ballDiameterMillimeters?: number;
  readonly ballRestitution?: number;
  readonly ballFriction?: number;
  readonly linearDamping?: number;
  readonly angularDamping?: number;
  readonly substeps?: number;
  readonly ccdEnabled?: boolean;
  readonly ballMaxVelocity?: number | null;
  readonly nailRadiusMillimeters?: number;
  readonly nailRestitution?: number;
  readonly nailFriction?: number;
  readonly launchAngleDegrees?: number;
  readonly launchStrength?: number;
  readonly launchVarianceDegrees?: number;
  readonly launchMinVelocity?: number;
  readonly launchMaxVelocity?: number;
  readonly physicsHz?: PhysicsHz;
}

export interface CalibrationScenario {
  readonly id: string;
  readonly board: BoardDefinition;
  readonly seed: number;
  readonly balls: number;
  readonly launchPower: number;
  readonly fireRate: FireRate;
  readonly simulationSpeed: SimulationSpeed;
  readonly ccdEnabled: boolean;
}

export interface ComparableMetrics {
  readonly startRate: number;
  readonly averageLifetime: number;
  readonly averageCollisionCount: number;
  readonly leftRouteRate: number;
  readonly centerRouteRate: number;
  readonly rightRouteRate: number;
}

export interface CalibrationComparison {
  readonly beforeScenarioId: string;
  readonly afterScenarioId: string;
  readonly delta: ComparableMetrics;
}

export const CALIBRATION_METRIC_NAMES = [
  "startRate", "outRate",
  "averageLifetime", "medianLifetime", "p95Lifetime",
  "averageCollisionCount", "medianCollisionCount", "p95CollisionCount", "collisionFrequencyPerSecond",
  "averageReflectionAngleDegrees",
  "averageVelocity", "p95Velocity", "maxVelocity",
  "averageTrajectoryPathLengthMillimeters",
  "heatmapOccupiedCellRate", "heatmapEntropy", "heatmapJensenShannonDivergence",
  "trajectoryMeanAbsoluteErrorMillimeters", "reflectionAngleMaeDegrees",
  "leftRouteRate", "centerRouteRate", "rightRouteRate",
] as const;

export type CalibrationMetricName = typeof CALIBRATION_METRIC_NAMES[number];
export type CalibrationMeasurements = Partial<Record<CalibrationMetricName, number>>;

export interface CalibrationLoss {
  readonly total: number;
  readonly components: Readonly<Partial<Record<CalibrationMetricName, { readonly observed: number; readonly simulated: number; readonly weight: number; readonly squaredError: number }>>>;
}

export const OBSERVED_DATASET_SCHEMA_VERSION = "2" as const;

const metricNameSchema = z.enum(CALIBRATION_METRIC_NAMES);
const rateMetricNames = new Set<CalibrationMetricName>([
  "startRate", "outRate", "heatmapOccupiedCellRate", "leftRouteRate", "centerRouteRate", "rightRouteRate",
]);
const observedMeasurementsSchema = z.partialRecord(metricNameSchema, z.number().finite().nonnegative())
  .refine((value) => Object.keys(value).length > 0, "At least one aggregate measurement is required")
  .superRefine((value, context) => {
    for (const name of rateMetricNames) {
      const measurement = value[name];
      if (measurement !== undefined && measurement > 1) context.addIssue({ code: "custom", path: [name], message: "Rate must be between 0 and 1" });
    }
    if (value.averageReflectionAngleDegrees !== undefined && value.averageReflectionAngleDegrees > 180) {
      context.addIssue({ code: "custom", path: ["averageReflectionAngleDegrees"], message: "Reflection angle must be between 0 and 180 degrees" });
    }
    if (value.averageVelocity !== undefined && value.maxVelocity !== undefined && value.maxVelocity < value.averageVelocity) {
      context.addIssue({ code: "custom", path: ["maxVelocity"], message: "maxVelocity must be >= averageVelocity" });
    }
  });

export const observedDatasetSchema = z.strictObject({
  schemaVersion: z.literal(OBSERVED_DATASET_SCHEMA_VERSION),
  datasetId: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/),
  split: z.enum(["TRAIN", "HOLDOUT"]),
  capturedAt: z.iso.datetime({ offset: true }),
  sourceFileSha256: z.string().regex(/^[a-fA-F0-9]{64}$/).transform((value) => value.toLowerCase()),
  rightsStatus: z.enum(["CLEARED", "INTERNAL_RESEARCH_ONLY"]),
  provenanceStatus: z.enum(["FIRST_PARTY_CAPTURE", "LICENSED_THIRD_PARTY", "PUBLIC_DOMAIN"]),
  machineId: z.string().min(1),
  boardId: z.string().min(1),
  ballCount: z.number().int().positive(),
  ballCountBasis: z.literal("LAUNCHED_BALLS"),
  launchPower: z.number().finite().min(0).max(1),
  fireRatePerMinute: z.number().finite().positive().max(100),
  boardTiltDegrees: z.number().finite(),
  trajectorySampleRateHz: z.number().finite().positive().optional(),
  heatmapCellSizeMillimeters: z.number().finite().positive().optional(),
  measurements: observedMeasurementsSchema,
}).superRefine((dataset, context) => {
  const hasSampledKinematics = dataset.measurements.averageTrajectoryPathLengthMillimeters !== undefined
    || dataset.measurements.averageVelocity !== undefined
    || dataset.measurements.p95Velocity !== undefined
    || dataset.measurements.maxVelocity !== undefined;
  if (hasSampledKinematics && dataset.trajectorySampleRateHz === undefined) {
    context.addIssue({ code: "custom", path: ["trajectorySampleRateHz"], message: "Trajectory and velocity measurements require their sample rate" });
  }
  const hasHeatmapMeasurement = dataset.measurements.heatmapOccupiedCellRate !== undefined || dataset.measurements.heatmapEntropy !== undefined;
  if (hasHeatmapMeasurement && dataset.heatmapCellSizeMillimeters === undefined) {
    context.addIssue({ code: "custom", path: ["heatmapCellSizeMillimeters"], message: "Heatmap measurements require their cell size" });
  }
});

export type ObservedDataset = z.infer<typeof observedDatasetSchema>;

/** Validates untrusted decoded JSON before it enters calibration. */
export function parseObservedDataset(input: unknown): ObservedDataset {
  return observedDatasetSchema.parse(input);
}

function validateComparisonArrays(left: readonly number[], right: readonly number[], nonnegative: boolean): void {
  if (left.length === 0 || left.length !== right.length) throw new Error("Comparison arrays must have the same non-zero length");
  if (!left.every(Number.isFinite) || !right.every(Number.isFinite)) throw new Error("Comparison arrays must contain only finite values");
  if (nonnegative && (left.some((value) => value < 0) || right.some((value) => value < 0))) throw new Error("Heatmap passages must be nonnegative");
}

/** Natural-log Jensen-Shannon divergence. Range is 0..ln(2). */
export function heatmapJensenShannonDivergence(observedPassages: readonly number[], simulatedPassages: readonly number[]): number {
  validateComparisonArrays(observedPassages, simulatedPassages, true);
  const observedTotal = observedPassages.reduce((sum, value) => sum + value, 0);
  const simulatedTotal = simulatedPassages.reduce((sum, value) => sum + value, 0);
  if (observedTotal === 0 && simulatedTotal === 0) return 0;
  if (observedTotal === 0 || simulatedTotal === 0) return Math.LN2;
  let divergence = 0;
  for (let index = 0; index < observedPassages.length; index += 1) {
    const observed = (observedPassages[index] ?? 0) / observedTotal;
    const simulated = (simulatedPassages[index] ?? 0) / simulatedTotal;
    const midpoint = (observed + simulated) / 2;
    if (observed > 0) divergence += observed * Math.log(observed / midpoint) / 2;
    if (simulated > 0) divergence += simulated * Math.log(simulated / midpoint) / 2;
  }
  return Math.max(0, divergence);
}

export function meanAbsoluteError(observed: readonly number[], simulated: readonly number[]): number {
  validateComparisonArrays(observed, simulated, false);
  return observed.reduce((sum, value, index) => sum + Math.abs(value - (simulated[index] ?? 0)), 0) / observed.length;
}

export interface ModelDimensionalityEvidence {
  readonly zDisplacementOver2mmRate?: number;
  readonly boardGlassContactRate?: number;
  readonly reflectionAngleMaeDegrees?: number;
  readonly startRateAbsoluteError?: number;
  readonly outRateAbsoluteError?: number;
  readonly heatmapJensenShannonDivergence?: number;
  readonly threeDimensionalHoldoutLossImprovementRate?: number;
}

export type ModelDimensionalityTrigger =
  | "Z_DISPLACEMENT_OVER_2MM_RATE"
  | "BOARD_GLASS_CONTACT_RATE"
  | "REFLECTION_ANGLE_MAE"
  | "START_RATE_ABSOLUTE_ERROR"
  | "OUT_RATE_ABSOLUTE_ERROR"
  | "HEATMAP_JENSEN_SHANNON_DIVERGENCE"
  | "THREE_DIMENSIONAL_HOLDOUT_LOSS_IMPROVEMENT";

export interface ModelDimensionalityAssessment {
  readonly decision: "KEEP_2D" | "BUILD_3D_PLAYGROUND" | "INSUFFICIENT_EVIDENCE";
  readonly triggeredReasons: readonly ModelDimensionalityTrigger[];
  readonly missingEvidence: readonly (keyof ModelDimensionalityEvidence)[];
}

const dimensionalityEvidenceNames = [
  "zDisplacementOver2mmRate",
  "boardGlassContactRate",
  "reflectionAngleMaeDegrees",
  "startRateAbsoluteError",
  "outRateAbsoluteError",
  "heatmapJensenShannonDivergence",
  "threeDimensionalHoldoutLossImprovementRate",
] as const satisfies readonly (keyof ModelDimensionalityEvidence)[];

/** Applies project decision gates only; these thresholds are not laws or manufacturer specifications. */
export function assessModelDimensionality(evidence: ModelDimensionalityEvidence): ModelDimensionalityAssessment {
  for (const name of dimensionalityEvidenceNames) {
    const value = evidence[name];
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error(`${name} must be finite and nonnegative`);
  }
  const missingEvidence = dimensionalityEvidenceNames.filter((name) => evidence[name] === undefined);
  if (missingEvidence.length > 0) return { decision: "INSUFFICIENT_EVIDENCE", triggeredReasons: [], missingEvidence };
  const completeEvidence = evidence as Required<ModelDimensionalityEvidence>;
  const triggeredReasons: ModelDimensionalityTrigger[] = [];
  if (completeEvidence.zDisplacementOver2mmRate >= 0.01) triggeredReasons.push("Z_DISPLACEMENT_OVER_2MM_RATE");
  if (completeEvidence.boardGlassContactRate >= 0.01) triggeredReasons.push("BOARD_GLASS_CONTACT_RATE");
  if (completeEvidence.reflectionAngleMaeDegrees > 5) triggeredReasons.push("REFLECTION_ANGLE_MAE");
  if (completeEvidence.startRateAbsoluteError > 0.02) triggeredReasons.push("START_RATE_ABSOLUTE_ERROR");
  if (completeEvidence.outRateAbsoluteError > 0.02) triggeredReasons.push("OUT_RATE_ABSOLUTE_ERROR");
  if (completeEvidence.heatmapJensenShannonDivergence > 0.05) triggeredReasons.push("HEATMAP_JENSEN_SHANNON_DIVERGENCE");
  if (completeEvidence.threeDimensionalHoldoutLossImprovementRate >= 0.2) triggeredReasons.push("THREE_DIMENSIONAL_HOLDOUT_LOSS_IMPROVEMENT");
  return {
    decision: triggeredReasons.length === 0 ? "KEEP_2D" : "BUILD_3D_PLAYGROUND",
    triggeredReasons,
    missingEvidence,
  };
}

export function applyCalibration(board: BoardDefinition, patch: CalibrationPatch): BoardDefinition {
  const physics = board.physics;
  const ball = board.ball;
  const launcher = board.launcher;
  return parseBoard({
    ...board,
    physics: {
      ...physics,
      gravity: patch.gravity ?? physics.gravity,
      gravityScale: patch.gravityScale ?? physics.gravityScale,
      physicsHz: patch.physicsHz ?? physics.physicsHz,
      linearDamping: patch.linearDamping ?? physics.linearDamping,
      angularDamping: patch.angularDamping ?? physics.angularDamping,
      substeps: patch.substeps ?? physics.substeps,
      ccdEnabled: patch.ccdEnabled ?? physics.ccdEnabled,
    },
    ball: {
      ...ball,
      massGrams: patch.ballMassGrams ?? ball.massGrams,
      diameter: patch.ballDiameterMillimeters ?? ball.diameter,
      restitution: patch.ballRestitution ?? ball.restitution,
      friction: patch.ballFriction ?? ball.friction,
      maxVelocity: patch.ballMaxVelocity === undefined ? ball.maxVelocity : patch.ballMaxVelocity,
    },
    launcher: {
      ...launcher,
      angleDegrees: patch.launchAngleDegrees ?? launcher.angleDegrees,
      strength: patch.launchStrength ?? launcher.strength,
      angleJitterDegrees: patch.launchVarianceDegrees ?? launcher.angleJitterDegrees,
      minVelocity: patch.launchMinVelocity ?? launcher.minVelocity,
      maxVelocity: patch.launchMaxVelocity ?? launcher.maxVelocity,
    },
    nails: board.nails.map((nail) => ({
      ...nail,
      radius: patch.nailRadiusMillimeters ?? nail.radius,
      restitution: patch.nailRestitution ?? nail.restitution,
      friction: patch.nailFriction ?? nail.friction,
    })),
  });
}

/** Scalar loss boundary for future observed-video calibration. No optimizer or target values are embedded here. */
export function calibrationLoss(observed: CalibrationMeasurements, simulated: CalibrationMeasurements, weights: CalibrationMeasurements = {}): CalibrationLoss {
  const components: Partial<Record<CalibrationMetricName, { observed: number; simulated: number; weight: number; squaredError: number }>> = {};
  let total = 0;
  for (const name of Object.keys(observed) as CalibrationMetricName[]) {
    const observedValue = observed[name];
    const simulatedValue = simulated[name];
    if (observedValue === undefined || simulatedValue === undefined) continue;
    const weight = weights[name] ?? 1;
    const squaredError = (simulatedValue - observedValue) ** 2 * weight;
    components[name] = { observed: observedValue, simulated: simulatedValue, weight, squaredError };
    total += squaredError;
  }
  return { total, components };
}

export function compareCalibration(beforeScenarioId: string, before: ComparableMetrics, afterScenarioId: string, after: ComparableMetrics): CalibrationComparison {
  return {
    beforeScenarioId,
    afterScenarioId,
    delta: {
      startRate: after.startRate - before.startRate,
      averageLifetime: after.averageLifetime - before.averageLifetime,
      averageCollisionCount: after.averageCollisionCount - before.averageCollisionCount,
      leftRouteRate: after.leftRouteRate - before.leftRouteRate,
      centerRouteRate: after.centerRouteRate - before.centerRouteRate,
      rightRouteRate: after.rightRouteRate - before.rightRouteRate,
    },
  };
}

const vectorSchema = z.strictObject({ x: z.number().finite(), y: z.number().finite() });
const trajectorySampleSchema = z.strictObject({
  frame: z.number().int().nonnegative(),
  timeSeconds: z.number().finite().nonnegative(),
  xMillimeters: z.number().finite(),
  yMillimeters: z.number().finite(),
  zMillimeters: z.number().finite().optional(),
});
const collisionObservationSchema = z.strictObject({
  timeSeconds: z.number().finite().nonnegative(),
  colliderRole: z.enum(["NAIL", "RAIL", "WINDMILL", "OTHER"]),
  colliderId: z.string().min(1),
  positionMillimeters: vectorSchema,
  velocityBeforeMetersPerSecond: vectorSchema,
  velocityAfterMetersPerSecond: vectorSchema,
});
const terminalObservationSchema = z.strictObject({
  role: z.enum(["START", "OUT", "OTHER"]),
  timeSeconds: z.number().finite().nonnegative(),
});
const observedBallSchema = z.strictObject({
  ballId: z.string().min(1),
  launchedAtSeconds: z.number().finite().nonnegative(),
  samples: z.array(trajectorySampleSchema).min(2),
  collisions: z.array(collisionObservationSchema),
  firstRoute: z.enum(["LEFT", "CENTER", "RIGHT"]).optional(),
  terminal: terminalObservationSchema.optional(),
}).superRefine((ball, context) => {
  for (let index = 1; index < ball.samples.length; index += 1) {
    const previous = ball.samples[index - 1];
    const current = ball.samples[index];
    if (previous !== undefined && current !== undefined && (current.frame <= previous.frame || current.timeSeconds <= previous.timeSeconds)) {
      context.addIssue({ code: "custom", path: ["samples", index], message: "Trajectory samples must have strictly increasing frame and time" });
    }
  }
  const lastSample = ball.samples.at(-1);
  if (ball.samples[0] !== undefined && ball.samples[0].timeSeconds < ball.launchedAtSeconds) {
    context.addIssue({ code: "custom", path: ["samples", 0, "timeSeconds"], message: "Trajectory cannot start before launch" });
  }
  if (ball.terminal !== undefined && lastSample !== undefined && ball.terminal.timeSeconds < lastSample.timeSeconds) {
    context.addIssue({ code: "custom", path: ["terminal", "timeSeconds"], message: "Terminal event cannot precede the final trajectory sample" });
  }
  for (let index = 0; index < ball.collisions.length; index += 1) {
    const collision = ball.collisions[index];
    if (collision === undefined) continue;
    if (collision.timeSeconds < ball.launchedAtSeconds || (ball.terminal !== undefined && collision.timeSeconds > ball.terminal.timeSeconds)) {
      context.addIssue({ code: "custom", path: ["collisions", index, "timeSeconds"], message: "Collision must occur during the ball lifetime" });
    }
  }
});

export const observedCaptureSchema = z.strictObject({
  schemaVersion: z.literal("1"),
  captureId: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/),
  captureSessionId: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/),
  split: z.enum(["TRAIN", "HOLDOUT"]),
  capturedAt: z.iso.datetime({ offset: true }),
  sourceFileSha256: z.string().regex(/^[a-fA-F0-9]{64}$/).transform((value) => value.toLowerCase()),
  rightsStatus: z.enum(["CLEARED", "INTERNAL_RESEARCH_ONLY"]),
  provenanceStatus: z.enum(["FIRST_PARTY_CAPTURE", "LICENSED_THIRD_PARTY", "PUBLIC_DOMAIN"]),
  machineId: z.string().min(1),
  boardId: z.string().min(1),
  launchPower: z.number().finite().min(0).max(1),
  fireRatePerMinute: z.number().finite().positive().max(100),
  boardTiltDegrees: z.number().finite(),
  glassSpacingMillimeters: z.number().finite().positive().optional(),
  frameRateHz: z.number().finite().min(240),
  sourceFrame: z.strictObject({ widthPixels: z.number().int().positive(), heightPixels: z.number().int().positive() }),
  coordinateSystem: z.literal("board-mm-top-left-y-down"),
  controlPoints: z.array(z.strictObject({
    sourcePixels: vectorSchema,
    boardMillimeters: vectorSchema,
  })).min(4),
  reprojectionErrorMillimeters: z.strictObject({ median: z.number().finite().nonnegative(), p95: z.number().finite().nonnegative() }),
  balls: z.array(observedBallSchema).min(1),
}).superRefine((capture, context) => {
  if (capture.reprojectionErrorMillimeters.p95 < capture.reprojectionErrorMillimeters.median) {
    context.addIssue({ code: "custom", path: ["reprojectionErrorMillimeters", "p95"], message: "p95 reprojection error must be >= median" });
  }
  const ballIds = new Set<string>();
  for (let index = 0; index < capture.balls.length; index += 1) {
    const ballId = capture.balls[index]?.ballId;
    if (ballId === undefined) continue;
    if (ballIds.has(ballId)) context.addIssue({ code: "custom", path: ["balls", index, "ballId"], message: "ballId must be unique within a capture" });
    ballIds.add(ballId);
  }
});

export type ObservedCapture = z.infer<typeof observedCaptureSchema>;

/** Validates frame-level annotations from an external capture before aggregation. */
export function parseObservedCapture(input: unknown): ObservedCapture {
  return observedCaptureSchema.parse(input);
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) throw new Error("Cannot calculate a percentile of an empty collection");
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function reflectionAngleDegrees(before: { readonly x: number; readonly y: number }, after: { readonly x: number; readonly y: number }): number | null {
  const beforeMagnitude = Math.hypot(before.x, before.y);
  const afterMagnitude = Math.hypot(after.x, after.y);
  if (beforeMagnitude === 0 || afterMagnitude === 0) return null;
  const cosine = Math.max(-1, Math.min(1, (before.x * after.x + before.y * after.y) / (beforeMagnitude * afterMagnitude)));
  return Math.acos(cosine) * 180 / Math.PI;
}

/** Converts validated frame annotations into the existing aggregate calibration boundary. */
export function summarizeObservedCapture(input: unknown): ObservedDataset {
  const capture = parseObservedCapture(input);
  const completeBalls = capture.balls.filter((ball) => ball.terminal !== undefined);
  const lifetimes = completeBalls.map((ball) => (ball.terminal?.timeSeconds ?? ball.launchedAtSeconds) - ball.launchedAtSeconds);
  const collisionCounts = completeBalls.map((ball) => ball.collisions.length);
  const paths: number[] = [];
  const velocities: number[] = [];
  const reflectionAngles: number[] = [];
  for (const ball of completeBalls) {
    let path = 0;
    for (let index = 1; index < ball.samples.length; index += 1) {
      const previous = ball.samples[index - 1];
      const current = ball.samples[index];
      if (previous === undefined || current === undefined) continue;
      const distanceMillimeters = Math.hypot(current.xMillimeters - previous.xMillimeters, current.yMillimeters - previous.yMillimeters);
      path += distanceMillimeters;
      velocities.push(distanceMillimeters / (current.timeSeconds - previous.timeSeconds) / 1_000);
    }
    paths.push(path);
    for (const collision of ball.collisions) {
      const angle = reflectionAngleDegrees(collision.velocityBeforeMetersPerSecond, collision.velocityAfterMetersPerSecond);
      if (angle !== null) reflectionAngles.push(angle);
    }
  }
  const routed = completeBalls.flatMap((ball) => ball.firstRoute === undefined ? [] : [ball.firstRoute]);
  const measurements: CalibrationMeasurements = {
    startRate: completeBalls.filter((ball) => ball.terminal?.role === "START").length / capture.balls.length,
    outRate: completeBalls.filter((ball) => ball.terminal?.role === "OUT").length / capture.balls.length,
  };
  if (lifetimes.length > 0) {
    measurements.averageLifetime = average(lifetimes);
    measurements.medianLifetime = percentile(lifetimes, 0.5);
    measurements.p95Lifetime = percentile(lifetimes, 0.95);
    measurements.averageCollisionCount = average(collisionCounts);
    measurements.medianCollisionCount = percentile(collisionCounts, 0.5);
    measurements.p95CollisionCount = percentile(collisionCounts, 0.95);
    const totalLifetime = lifetimes.reduce((sum, value) => sum + value, 0);
    if (totalLifetime > 0) measurements.collisionFrequencyPerSecond = collisionCounts.reduce((sum, value) => sum + value, 0) / totalLifetime;
    measurements.averageTrajectoryPathLengthMillimeters = average(paths);
  }
  if (velocities.length > 0) {
    measurements.averageVelocity = average(velocities);
    measurements.p95Velocity = percentile(velocities, 0.95);
    measurements.maxVelocity = Math.max(...velocities);
  }
  if (reflectionAngles.length > 0) measurements.averageReflectionAngleDegrees = average(reflectionAngles);
  if (routed.length > 0) {
    measurements.leftRouteRate = routed.filter((route) => route === "LEFT").length / routed.length;
    measurements.centerRouteRate = routed.filter((route) => route === "CENTER").length / routed.length;
    measurements.rightRouteRate = routed.filter((route) => route === "RIGHT").length / routed.length;
  }
  return parseObservedDataset({
    schemaVersion: OBSERVED_DATASET_SCHEMA_VERSION,
    datasetId: capture.captureId,
    split: capture.split,
    capturedAt: capture.capturedAt,
    sourceFileSha256: capture.sourceFileSha256,
    rightsStatus: capture.rightsStatus,
    provenanceStatus: capture.provenanceStatus,
    machineId: capture.machineId,
    boardId: capture.boardId,
    ballCount: capture.balls.length,
    ballCountBasis: "LAUNCHED_BALLS",
    launchPower: capture.launchPower,
    fireRatePerMinute: capture.fireRatePerMinute,
    boardTiltDegrees: capture.boardTiltDegrees,
    trajectorySampleRateHz: capture.frameRateHz,
    measurements,
  });
}

/** Prevents a tuned source or capture session from being reused as HOLDOUT evidence. */
export function assertIndependentTrainHoldout(train: ObservedCapture, holdout: ObservedCapture): void {
  if (train.split !== "TRAIN" || holdout.split !== "HOLDOUT") throw new Error("Expected TRAIN then HOLDOUT captures");
  if (train.machineId !== holdout.machineId || train.boardId !== holdout.boardId) throw new Error("TRAIN and HOLDOUT must describe the same machine and board");
  if (train.sourceFileSha256 === holdout.sourceFileSha256) throw new Error("TRAIN and HOLDOUT cannot use the same source file");
  if (train.captureSessionId === holdout.captureSessionId) throw new Error("TRAIN and HOLDOUT must come from different capture sessions");
}
