import { PachinkoPhysicsEngine } from "@pachinko/physics-core";
import { loadBoard } from "./load-board.js";

const board = await loadBoard();
const engine = await PachinkoPhysicsEngine.create({ board, seed: 123456, ccdEnabled: true });
const requested = Number(process.argv[2] ?? 1000);
if (!Number.isInteger(requested) || requested <= 0) throw new Error("ball count must be a positive integer");
const balls = requested;
const power = Number(process.argv[3] ?? 0.68);
if (!Number.isFinite(power) || power < 0 || power > 1) throw new Error("power must be between 0 and 1");
const intervalTicks = Math.round(0.6 * engine.physicsHz);
for (let index = 0; index < balls; index += 1) {
  engine.schedule({ type: "launch", tick: index * intervalTicks, sequence: index, power });
}
const finalTick = (balls - 1) * intervalTicks + Math.ceil(13 * engine.physicsHz);
while (engine.tick <= finalTick && engine.completedBalls.length < balls) engine.step();
const timeouts = engine.completedBalls.filter((ball) => ball.terminal === "timeout").map((ball) => ({
  id: ball.id,
  xMm: Math.round(ball.finalPosition.x * 1000),
  yMm: Math.round(ball.finalPosition.y * 1000),
  collisions: ball.collisionCount,
}));
process.stdout.write(`${JSON.stringify({ balls, power, count: timeouts.length, timeouts }, null, 2)}\n`);
engine.dispose();
