import { describe, expect, it } from "vitest";
import { createBoardTemplate } from "@pachinko/board-schema";
import { loadBoard } from "./load-board.js";
import { runBatch } from "./index.js";

function pointSegmentDistance(point: { x: number; y: number }, from: { x: number; y: number }, to: { x: number; y: number }): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - from.x - t * dx, point.y - from.y - t * dy);
}

function pointInPolygon(point: { x: number; y: number }, polygon: ReadonlyArray<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    if (a === undefined || b === undefined) continue;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

describe("headless batch runner", () => {
  it("collects role counts and trajectory samples without enabling a heatmap", async () => {
    const base = createBoardTemplate();
    const board = createBoardTemplate({
      physics: { ...base.physics, maxBallLifetimeSeconds: 2 },
      launcher: { position: { x: 250, y: 50 }, strength: 1, angleDegrees: 90, minVelocity: 1, maxVelocity: 1, angleJitterDegrees: 0 },
      sensors: [
        { id: "left-route", role: "ROUTE_LEFT", center: { x: 250, y: 80 }, width: 40, height: 8 },
        { id: "through", role: "THROUGH", center: { x: 250, y: 100 }, width: 40, height: 8 },
        { id: "center-route", role: "ROUTE_CENTER", center: { x: 250, y: 120 }, width: 40, height: 8 },
        { id: "out", role: "OUT", center: { x: 250, y: 145 }, width: 40, height: 8 },
      ],
    });
    const metrics = await runBatch({ board, balls: 1, seed: 21, launchPower: 1, fireRate: 100, collectTrajectories: true });
    expect(metrics.heatmap).toBeNull();
    expect(metrics.sensorEnterCounts).toEqual({ ROUTE_LEFT: 1, THROUGH: 1, ROUTE_CENTER: 1, OUT: 1 });
    expect(metrics.firstLeftRouteRate).toBe(1);
    expect(metrics.firstCenterRouteRate).toBe(0);
    expect(metrics.routeEnterCounts).toEqual({ left: 1, center: 1, right: 0 });
    expect(metrics.routeExposureRates).toEqual({ left: 1, center: 1, right: 0 });
    expect(metrics.trajectories?.[0]?.routeSequence).toEqual(["left", "center"]);
    expect(metrics.trajectories?.[0]?.cells).toEqual([]);
    expect(metrics.trajectories?.[0]?.samples.length).toBeGreaterThan(1);
  });

  it("completes 1000 balls with finite metrics and no body leaks", async () => {
    const metrics = await runBatch({ board: await loadBoard(), balls: 1000, seed: 123456, launchPower: 0.68, fireRate: 100, heatmapCellSizeMillimeters: 25 });
    expect(metrics.ballsLaunched).toBe(1000);
    expect(metrics.startEntries + metrics.outEntries + metrics.otherPocketEntries + metrics.timeouts).toBe(1000);
    expect(metrics.timeouts).toBe(0);
    expect(metrics.finite).toBe(true);
    expect(metrics.remainingBodies).toBe(0);
    expect(metrics.totalBalls).toBe(1000);
    expect(metrics.startWins).toBe(metrics.startEntries);
    expect(metrics.outRate).toBe(metrics.outEntries / metrics.totalBalls);
    expect(metrics.p95Lifetime).toBeGreaterThanOrEqual(metrics.medianLifetime);
    expect(metrics.p95CollisionCount).toBeGreaterThanOrEqual(metrics.medianCollisionCount);
    expect(metrics.maxVelocity).toBeGreaterThanOrEqual(metrics.averageVelocity);
    expect(metrics.velocityClampCount).toBe(0);
    expect(metrics.heatmap?.cells.some((cell) => cell.ballPassages > 0)).toBe(true);
    expect(metrics.heatmap?.cells.some((cell) => cell.collisions > 0)).toBe(true);
    for (const value of Object.values(metrics)) if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
  });

  it("drains the reproduced high-power launch-seam case to a terminal", async () => {
    const metrics = await runBatch({ board: await loadBoard(), balls: 500, seed: 123456, launchPower: 0.85, fireRate: 100 });
    expect(metrics.startEntries + metrics.outEntries + metrics.otherPocketEntries).toBe(500);
    expect(metrics.timeouts).toBe(0);
    expect(metrics.remainingBodies).toBe(0);
  });

  it("naturally drains the full handle range without timeout cleanup", async () => {
    const board = await loadBoard();
    for (const launchPower of [0, 0.5, 0.68, 0.85, 1]) {
      const metrics = await runBatch({ board, balls: 50, seed: 123456, launchPower, fireRate: 100 });
      expect(metrics.timeouts, `power ${launchPower}`).toBe(0);
      expect(metrics.remainingBodies, `power ${launchPower}`).toBe(0);
    }
  });

  it("keeps the reproduced fixed-geometry traps wider than the ball", async () => {
    const board = await loadBoard();
    const nail = (id: string) => {
      const found = board.nails.find((candidate) => candidate.id === id);
      if (found === undefined) throw new Error(`Missing nail: ${id}`);
      return found;
    };
    const rail = (id: string) => {
      const found = [...board.rails, ...board.mechanisms.flatMap((mechanism) => mechanism.colliders)].find((candidate) => candidate.id === id);
      if (found === undefined) throw new Error(`Missing rail: ${id}`);
      return found;
    };
    const nailRailGap = (nailId: string, railId: string) => {
      const pin = nail(nailId);
      const edge = rail(railId);
      return pointSegmentDistance({ x: pin.positionX, y: pin.positionY }, edge.from, edge.to) - pin.radius - edge.thickness / 2;
    };
    const n109 = nail("n109");
    const n110 = nail("n110");
    expect(nailRailGap("n050", "right-upper")).toBeGreaterThanOrEqual(11.5);
    expect(nailRailGap("n050", "right-lower")).toBeGreaterThanOrEqual(11.5);
    expect(nailRailGap("n059", "right-lower")).toBeGreaterThanOrEqual(11.5);
    expect(nailRailGap("n004", "strong-shot-return")).toBeGreaterThanOrEqual(11.5);
    expect(Math.hypot(n109.positionX - n110.positionX, n109.positionY - n110.positionY) - n109.radius - n110.radius).toBeGreaterThanOrEqual(11.5);
  });

  it("drains without relying on later balls to dislodge a trapped ball", async () => {
    const metrics = await runBatch({ board: await loadBoard(), balls: 200, seed: 123456, launchPower: 0.68, fireRate: 25 });
    expect(metrics.timeouts).toBe(0);
    expect(metrics.remainingBodies).toBe(0);
  });

  it("keeps the closed LCD aperture free of enabled nails", async () => {
    const board = await loadBoard();
    const display = board.mechanisms.find((mechanism) => mechanism.id === "center-display-collider");
    expect(display).toBeDefined();
    if (display === undefined) throw new Error("Missing center-display-collider");
    const endpoints = display.colliders.flatMap((collider) => [collider.from, collider.to]);
    const unique = [...new Map(endpoints.map((point) => [`${point.x},${point.y}`, point])).values()];
    const center = unique.reduce((sum, point) => ({ x: sum.x + point.x / unique.length, y: sum.y + point.y / unique.length }), { x: 0, y: 0 });
    const polygon = unique.sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
    const degrees = endpoints.reduce((counts, point) => counts.set(`${point.x},${point.y}`, (counts.get(`${point.x},${point.y}`) ?? 0) + 1), new Map<string, number>());
    expect([...degrees.values()].every((degree) => degree === 2)).toBe(true);
    expect(board.nails.filter((nail) => nail.enabled && pointInPolygon({ x: nail.positionX, y: nail.positionY }, polygon)).map((nail) => nail.id)).toEqual([]);
  });

  it("keeps every enabled physical nail clear of nails and fixed surfaces", async () => {
    const board = await loadBoard();
    const nails = board.nails.filter((nail) => nail.enabled);
    const arcSegments = board.arcRails.flatMap((arc) => Array.from({ length: arc.segments }, (_, index) => {
      const start = (arc.startAngleDegrees + (arc.endAngleDegrees - arc.startAngleDegrees) * index / arc.segments) * Math.PI / 180;
      const end = (arc.startAngleDegrees + (arc.endAngleDegrees - arc.startAngleDegrees) * (index + 1) / arc.segments) * Math.PI / 180;
      return {
        id: `${arc.id}-${index}`,
        from: { x: arc.center.x + Math.cos(start) * arc.radius, y: arc.center.y + Math.sin(start) * arc.radius },
        to: { x: arc.center.x + Math.cos(end) * arc.radius, y: arc.center.y + Math.sin(end) * arc.radius },
        thickness: arc.thickness,
      };
    }));
    const fixed = [
      ...board.rails,
      ...arcSegments,
      ...board.gates.filter((gate) => gate.enabled),
      ...board.mechanisms.filter((mechanism) => mechanism.enabled).flatMap((mechanism) => mechanism.colliders.filter((collider) => collider.bodyType === "FIXED").map((collider) => ({ ...collider, id: `${mechanism.id}/${collider.id}` }))),
    ];
    for (let index = 0; index < nails.length; index += 1) {
      const nail = nails[index];
      if (nail === undefined) continue;
      for (const surface of fixed) {
        const clearance = pointSegmentDistance({ x: nail.positionX, y: nail.positionY }, surface.from, surface.to) - nail.radius - surface.thickness / 2;
        expect(clearance, `${nail.id} overlaps ${surface.id}`).toBeGreaterThanOrEqual(0);
      }
      for (const other of nails.slice(index + 1)) {
        const clearance = Math.hypot(nail.positionX - other.positionX, nail.positionY - other.positionY) - nail.radius - other.radius;
        expect(clearance, `${nail.id} traps a ball against ${other.id}`).toBeGreaterThanOrEqual(board.ball.diameter);
      }
    }
    const start = board.sensors.find((sensor) => sensor.role === "START");
    const left = nails.find((nail) => nail.id === "n110");
    const right = nails.find((nail) => nail.id === "n111");
    expect(start).toBeDefined();
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    if (start !== undefined && left !== undefined && right !== undefined) {
      expect(left.positionX).toBeLessThan(start.center.x);
      expect(right.positionX).toBeGreaterThan(start.center.x);
      expect(right.positionX - left.positionX - left.radius - right.radius).toBeGreaterThanOrEqual(board.ball.diameter);
    }
  });
});
