import type { BoardDefinition } from "@pachinko/board-schema";
import { createLaunchCommand, launcherConfigFromBoard } from "@pachinko/input-system";
import { PachinkoPhysicsEngine, PHYSICS_VERSION, type HeatmapResult, type Route, type SensorEnterCounts, type SensorRole, type TrajectoryCellSummary, type TrajectorySample } from "@pachinko/physics-core";

export interface BatchOptions {
  readonly board: BoardDefinition;
  readonly balls: number;
  readonly seed: number;
  readonly launchPower: number;
  readonly fireRate: 25 | 50 | 75 | 100;
  readonly ccdEnabled?: boolean;
  readonly physicsHz?: 120 | 240 | 480;
  readonly substeps?: number;
  readonly heatmapCellSizeMillimeters?: number;
  readonly collectTrajectories?: boolean;
}

export interface SimulationMetrics {
  readonly boardId: string;
  readonly boardVersion: string;
  readonly physicsVersion: string;
  readonly seed: number;
  readonly launchPower: number;
  readonly fireRate: number;
  readonly physicsHz: number;
  readonly ccdEnabled: boolean;
  readonly substeps: number;
  readonly totalBalls: number;
  readonly startWins: number;
  readonly outCount: number;
  readonly otherSensorCount: number;
  readonly sensorEnterCounts: SensorEnterCounts;
  readonly timeoutCount: number;
  readonly ballsLaunched: number;
  readonly startEntries: number;
  /** Physical START-mouth entries. Accepted spins and full-hold overflow are runtime presentation metrics. */
  readonly startPocketEntries: number;
  readonly outEntries: number;
  readonly otherPocketEntries: number;
  readonly timeouts: number;
  readonly startRate: number;
  /** Physical START-mouth entries divided by launched balls; never borrowed-ball or prize-replay basis. */
  readonly physicalStartRatePerLaunchedBall: number;
  readonly outRate: number;
  readonly averageLifetime: number;
  readonly medianLifetime: number;
  readonly p95Lifetime: number;
  readonly averageCollisionCount: number;
  readonly medianCollisionCount: number;
  readonly p95CollisionCount: number;
  readonly averageVelocity: number;
  readonly maxVelocity: number;
  readonly averageCollisionSpeedBefore: number;
  readonly averageCollisionSpeedAfter: number;
  readonly maxCollisionSpeedBefore: number;
  readonly maxCollisionSpeedAfter: number;
  /** Rapier collision events are drained after a substep, so these speeds bracket the substep rather than the exact impulse instant. */
  readonly collisionVelocityMeasurement: "SUBSTEP_BOUNDARY_PROXY";
  readonly velocityClampCount: number;
  readonly nailCollisionCount: number;
  readonly railCollisionCount: number;
  readonly windmillCollisionCount: number;
  /** Compatibility alias for firstLeftRouteRate. */
  readonly leftRouteRate: number;
  /** Compatibility alias for firstCenterRouteRate. */
  readonly centerRouteRate: number;
  /** Compatibility alias for firstRightRouteRate. */
  readonly rightRouteRate: number;
  /** First route sensor entered, with final-position fallback when no route sensor fired. */
  readonly firstLeftRouteRate: number;
  readonly firstCenterRouteRate: number;
  readonly firstRightRouteRate: number;
  /** Total ROUTE_* sensor enter events; one ball may contribute to multiple routes or re-enter one route. */
  readonly routeEnterCounts: Readonly<Record<Route, number>>;
  /** Fraction of completed balls that entered each route at least once; values need not sum to one. */
  readonly routeExposureRates: Readonly<Record<Route, number>>;
  readonly simulatedSeconds: number;
  readonly wallClockMilliseconds: number;
  readonly finite: boolean;
  readonly remainingBodies: number;
  readonly heatmap: HeatmapResult | null;
  readonly trajectories?: readonly {
    readonly ballId: string;
    readonly routeSequence: readonly ("left" | "center" | "right")[];
    readonly cells: readonly TrajectoryCellSummary[];
    readonly samples: readonly TrajectorySample[];
  }[];
}

function ratio(count: number, total: number): number { return total === 0 ? 0 : count / total; }
function average(values: readonly number[]): number { return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length; }
function percentile(values: readonly number[], probability: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower] ?? 0;
  const high = sorted[upper] ?? low;
  return low + (high - low) * (position - lower);
}

export async function runBatch(options: BatchOptions): Promise<SimulationMetrics> {
  if (!Number.isInteger(options.balls) || options.balls <= 0) throw new Error("balls must be a positive integer");
  const startedAt = performance.now();
  const engine = await PachinkoPhysicsEngine.create({
    board: options.board,
    seed: options.seed,
    ccdEnabled: options.ccdEnabled ?? options.board.physics.ccdEnabled,
    ...(options.physicsHz === undefined ? {} : { physicsHz: options.physicsHz }),
    ...(options.substeps === undefined ? {} : { substeps: options.substeps }),
    ...(options.heatmapCellSizeMillimeters === undefined ? {} : { heatmapCellSizeMillimeters: options.heatmapCellSizeMillimeters }),
    ...(options.collectTrajectories === undefined ? {} : { collectTrajectories: options.collectTrajectories }),
  });
  const intervalTicks = Math.round((60 / options.fireRate) * engine.physicsHz);
  const launcher = launcherConfigFromBoard(options.board, options.launchPower);
  for (let index = 0; index < options.balls; index += 1) {
    engine.schedule(createLaunchCommand(launcher, index * intervalTicks, index));
  }
  const finalLaunchTick = (options.balls - 1) * intervalTicks;
  const drainTicks = Math.ceil(
    (options.board.physics.maxBallLifetimeSeconds + options.board.physics.terminalRetentionSeconds) * engine.physicsHz,
  ) + 2;
  const finalTick = finalLaunchTick + drainTicks;
  let finite = true;
  while (engine.tick <= finalTick && engine.completedBalls.length < options.balls) {
    engine.step();
    finite &&= engine.diagnostics().finite;
  }
  const completed = [...engine.completedBalls];
  const diagnostics = engine.diagnostics();
  const starts = completed.filter((ball) => ball.terminal === "start").length;
  const outs = completed.filter((ball) => ball.terminal === "out").length;
  const pockets = completed.filter((ball) => ball.terminal === "otherPocket").length;
  const timeouts = completed.filter((ball) => ball.terminal === "timeout").length;
  const left = completed.filter((ball) => ball.route === "left").length;
  const center = completed.filter((ball) => ball.route === "center").length;
  const right = completed.filter((ball) => ball.route === "right").length;
  const velocitySampleCount = completed.reduce((sum, ball) => sum + ball.velocitySampleCount, 0);
  const velocitySum = completed.reduce((sum, ball) => sum + ball.velocitySum, 0);
  const collisionVelocitySamples = completed.reduce((sum, ball) => sum + ball.collisionVelocity.samples, 0);
  const sensorEnterCounts: Partial<Record<SensorRole, number>> = {};
  for (const ball of completed) {
    for (const role of Object.keys(ball.sensorEnterCounts) as SensorRole[]) {
      sensorEnterCounts[role] = (sensorEnterCounts[role] ?? 0) + (ball.sensorEnterCounts[role] ?? 0);
    }
  }
  const routeEnterCounts = {
    left: sensorEnterCounts.ROUTE_LEFT ?? 0,
    center: sensorEnterCounts.ROUTE_CENTER ?? 0,
    right: sensorEnterCounts.ROUTE_RIGHT ?? 0,
  };
  const routeExposureRates = {
    left: ratio(completed.filter((ball) => ball.routeSequence.includes("left")).length, completed.length),
    center: ratio(completed.filter((ball) => ball.routeSequence.includes("center")).length, completed.length),
    right: ratio(completed.filter((ball) => ball.routeSequence.includes("right")).length, completed.length),
  };
  const trajectories = options.collectTrajectories ? completed.map((ball) => ({
    ballId: ball.id,
    routeSequence: ball.routeSequence,
    cells: ball.trajectory ?? [],
    samples: ball.trajectorySamples ?? [],
  })) : undefined;
  const metrics: SimulationMetrics = {
    boardId: options.board.id,
    boardVersion: options.board.version,
    physicsVersion: PHYSICS_VERSION,
    seed: options.seed,
    launchPower: options.launchPower,
    fireRate: options.fireRate,
    physicsHz: engine.physicsHz,
    ccdEnabled: options.ccdEnabled ?? options.board.physics.ccdEnabled,
    substeps: options.substeps ?? options.board.physics.substeps,
    totalBalls: options.balls,
    startWins: starts,
    outCount: outs,
    otherSensorCount: completed.reduce((sum, ball) => sum + ball.otherSensorCount, 0),
    sensorEnterCounts,
    timeoutCount: timeouts,
    ballsLaunched: options.balls,
    startEntries: starts,
    startPocketEntries: starts,
    outEntries: outs,
    otherPocketEntries: pockets,
    timeouts,
    startRate: ratio(starts, options.balls),
    physicalStartRatePerLaunchedBall: ratio(starts, options.balls),
    outRate: ratio(outs, completed.length),
    averageLifetime: average(completed.map((ball) => ball.lifetime)),
    medianLifetime: percentile(completed.map((ball) => ball.lifetime), 0.5),
    p95Lifetime: percentile(completed.map((ball) => ball.lifetime), 0.95),
    averageCollisionCount: average(completed.map((ball) => ball.collisionCount)),
    medianCollisionCount: percentile(completed.map((ball) => ball.collisionCount), 0.5),
    p95CollisionCount: percentile(completed.map((ball) => ball.collisionCount), 0.95),
    averageVelocity: velocitySampleCount === 0 ? 0 : velocitySum / velocitySampleCount,
    maxVelocity: completed.reduce((maximum, ball) => Math.max(maximum, ball.maxVelocity), 0),
    averageCollisionSpeedBefore: collisionVelocitySamples === 0 ? 0 : completed.reduce((sum, ball) => sum + ball.collisionVelocity.speedBeforeSum, 0) / collisionVelocitySamples,
    averageCollisionSpeedAfter: collisionVelocitySamples === 0 ? 0 : completed.reduce((sum, ball) => sum + ball.collisionVelocity.speedAfterSum, 0) / collisionVelocitySamples,
    maxCollisionSpeedBefore: completed.reduce((maximum, ball) => Math.max(maximum, ball.collisionVelocity.maxSpeedBefore), 0),
    maxCollisionSpeedAfter: completed.reduce((maximum, ball) => Math.max(maximum, ball.collisionVelocity.maxSpeedAfter), 0),
    collisionVelocityMeasurement: "SUBSTEP_BOUNDARY_PROXY",
    velocityClampCount: completed.reduce((sum, ball) => sum + ball.velocityClampCount, 0),
    nailCollisionCount: completed.reduce((sum, ball) => sum + ball.nailCollisionCount, 0),
    railCollisionCount: completed.reduce((sum, ball) => sum + ball.railCollisionCount, 0),
    windmillCollisionCount: completed.reduce((sum, ball) => sum + ball.windmillCollisionCount, 0),
    leftRouteRate: ratio(left, completed.length),
    centerRouteRate: ratio(center, completed.length),
    rightRouteRate: ratio(right, completed.length),
    firstLeftRouteRate: ratio(left, completed.length),
    firstCenterRouteRate: ratio(center, completed.length),
    firstRightRouteRate: ratio(right, completed.length),
    routeEnterCounts,
    routeExposureRates,
    simulatedSeconds: engine.simulationTime,
    wallClockMilliseconds: performance.now() - startedAt,
    finite,
    remainingBodies: diagnostics.dynamicBodyCount,
    heatmap: engine.heatmapResult(),
    ...(trajectories === undefined ? {} : { trajectories }),
  };
  engine.dispose();
  if (completed.length !== options.balls) throw new Error(`Simulation incomplete: ${completed.length}/${options.balls}`);
  return metrics;
}
