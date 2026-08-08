import type { BoardDefinition } from "@pachinko/board-schema";
import { PachinkoPhysicsEngine, PHYSICS_VERSION } from "@pachinko/physics-core";

export interface BatchOptions {
  readonly board: BoardDefinition;
  readonly balls: number;
  readonly seed: number;
  readonly launchPower: number;
  readonly fireRate: 25 | 50 | 75 | 100;
  readonly ccdEnabled?: boolean;
  readonly physicsHz?: 120 | 240 | 480;
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
  readonly ballsLaunched: number;
  readonly startEntries: number;
  readonly outEntries: number;
  readonly otherPocketEntries: number;
  readonly timeouts: number;
  readonly startRate: number;
  readonly averageLifetime: number;
  readonly averageCollisionCount: number;
  readonly leftRouteRate: number;
  readonly centerRouteRate: number;
  readonly rightRouteRate: number;
  readonly simulatedSeconds: number;
  readonly wallClockMilliseconds: number;
  readonly finite: boolean;
  readonly remainingBodies: number;
}

function ratio(count: number, total: number): number { return total === 0 ? 0 : count / total; }
function average(values: readonly number[]): number { return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length; }

export async function runBatch(options: BatchOptions): Promise<SimulationMetrics> {
  if (!Number.isInteger(options.balls) || options.balls <= 0) throw new Error("balls must be a positive integer");
  const startedAt = performance.now();
  const engine = await PachinkoPhysicsEngine.create({
    board: options.board,
    seed: options.seed,
    ccdEnabled: options.ccdEnabled ?? true,
    ...(options.physicsHz === undefined ? {} : { physicsHz: options.physicsHz }),
  });
  const intervalTicks = Math.round((60 / options.fireRate) * engine.physicsHz);
  for (let index = 0; index < options.balls; index += 1) {
    engine.schedule({ type: "launch", tick: index * intervalTicks, sequence: index, power: options.launchPower });
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
  const metrics: SimulationMetrics = {
    boardId: options.board.id,
    boardVersion: options.board.version,
    physicsVersion: PHYSICS_VERSION,
    seed: options.seed,
    launchPower: options.launchPower,
    fireRate: options.fireRate,
    physicsHz: engine.physicsHz,
    ccdEnabled: options.ccdEnabled ?? true,
    ballsLaunched: options.balls,
    startEntries: starts,
    outEntries: outs,
    otherPocketEntries: pockets,
    timeouts,
    startRate: ratio(starts, completed.length),
    averageLifetime: average(completed.map((ball) => ball.lifetime)),
    averageCollisionCount: average(completed.map((ball) => ball.collisionCount)),
    leftRouteRate: ratio(left, completed.length),
    centerRouteRate: ratio(center, completed.length),
    rightRouteRate: ratio(right, completed.length),
    simulatedSeconds: engine.simulationTime,
    wallClockMilliseconds: performance.now() - startedAt,
    finite,
    remainingBodies: diagnostics.dynamicBodyCount,
  };
  engine.dispose();
  if (completed.length !== options.balls) throw new Error(`Simulation incomplete: ${completed.length}/${options.balls}`);
  return metrics;
}
