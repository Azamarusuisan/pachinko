import type { PhysicsEvent } from "@pachinko/event-system";
import { PachinkoPhysicsEngine } from "@pachinko/physics-core";
import { loadBoard } from "./load-board.js";

const board = await loadBoard();
const engine = await PachinkoPhysicsEngine.create({ board, seed: 123456, ccdEnabled: true });
const events: PhysicsEvent[] = [];
engine.events.onAny((event) => events.push(event));
const power = Number(process.argv[2] ?? 0.68);
if (!Number.isFinite(power) || power < 0 || power > 1) throw new Error("power must be between 0 and 1");
engine.schedule({ type: "launch", tick: 0, sequence: 0, power });

const samples: unknown[] = [];
while (engine.completedBalls.length === 0 && engine.tick < board.physics.maxBallLifetimeSeconds * engine.physicsHz) {
  engine.step();
  if (engine.tick % 12 === 0) {
    const ball = engine.snapshot().balls[0];
    if (ball !== undefined) samples.push({ tick: engine.tick, time: engine.simulationTime, position: ball.position, velocity: ball.velocity, state: ball.state, collisions: ball.collisionCount });
  }
}
process.stdout.write(`${JSON.stringify({ power, samples, events, completed: engine.completedBalls }, null, 2)}\n`);
engine.dispose();
