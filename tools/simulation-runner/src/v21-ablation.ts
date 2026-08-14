import { parseBoard, type BoardDefinition } from "@pachinko/board-schema";
import { runBatch } from "./index.js";
import { loadBoard } from "./load-board.js";

interface Variant { readonly name: string; readonly mutate: (board: BoardDefinition) => BoardDefinition; readonly power?: number }
const identity = (board: BoardDefinition): BoardDefinition => board;
const source = await loadBoard();
const variants: readonly Variant[] = [
  { name: `current-${source.version}`, mutate: identity },
  { name: "remove-strong-shot-return", mutate: (board) => parseBoard({ ...board, rails: board.rails.filter((rail) => rail.id !== "strong-shot-return") }) },
  { name: "strong-shot-return-restitution-0.30", mutate: (board) => parseBoard({ ...board, rails: board.rails.map((rail) => rail.id === "strong-shot-return" ? { ...rail, restitution: 0.3 } : rail) }) },
  { name: "gate-bidirectional", mutate: (board) => parseBoard({ ...board, gates: board.gates.map((gate) => gate.id === "launch-inner-one-way" ? { ...gate, collisionMode: "BIDIRECTIONAL" } : gate) }) },
  { name: "remove-launch-inner-gate", mutate: (board) => parseBoard({ ...board, gates: board.gates.filter((gate) => gate.id !== "launch-inner-one-way") }) },
  { name: "remove-return-and-gate", mutate: (board) => parseBoard({ ...board, rails: board.rails.filter((rail) => rail.id !== "strong-shot-return"), gates: board.gates.filter((gate) => gate.id !== "launch-inner-one-way") }) },
  { name: "remove-right-terminal-sensors", mutate: (board) => parseBoard({ ...board, sensors: board.sensors.filter((sensor) => sensor.role !== "ELECTRIC_SUPPORT" && sensor.role !== "ATTACKER") }) },
  { name: "disable-right-route-nails", mutate: (board) => parseBoard({ ...board, nails: board.nails.map((nail) => nail.group === "right-route" ? { ...nail, enabled: false } : nail) }) },
  { name: "no-gate-angle-minus-98", power: 0.68, mutate: (board) => parseBoard({ ...board, launcher: { ...board.launcher, angleDegrees: -98 }, gates: board.gates.filter((gate) => gate.id !== "launch-inner-one-way") }) },
  { name: "no-gate-strength-0.50", power: 0.5, mutate: (board) => parseBoard({ ...board, gates: board.gates.filter((gate) => gate.id !== "launch-inner-one-way") }) },
];

const results = [];
for (const variant of variants) {
  const power = variant.power ?? source.launcher.strength;
  const metrics = await runBatch({ board: variant.mutate(source), balls: 1000, seed: 123456, launchPower: power, fireRate: 100 });
  results.push({
    name: variant.name, power, startRate: metrics.startRate, outRate: metrics.outRate,
    otherRate: metrics.otherPocketEntries / metrics.totalBalls, averageLifetime: metrics.averageLifetime,
    averageCollisionCount: metrics.averageCollisionCount, averageVelocity: metrics.averageVelocity,
    maxVelocity: metrics.maxVelocity, leftRouteRate: metrics.leftRouteRate,
    centerRouteRate: metrics.centerRouteRate, rightRouteRate: metrics.rightRouteRate,
    timeoutCount: metrics.timeoutCount, remainingBodies: metrics.remainingBodies,
  });
}
process.stdout.write(`${JSON.stringify({ provenance: { boardVersion: source.version, seed: 123456, balls: 1000 }, results }, null, 2)}\n`);
