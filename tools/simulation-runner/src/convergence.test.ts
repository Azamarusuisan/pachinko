import { describe, expect, it } from "vitest";
import { createBoardTemplate } from "@pachinko/board-schema";
import { PachinkoPhysicsEngine } from "@pachinko/physics-core";
import { RATE_UNCERTAINTY, evaluateConvergence, runConvergence, type ConvergenceSnapshot } from "./convergence.js";
import { runBatch } from "./index.js";
import { loadBoard } from "./load-board.js";

const stable: ConvergenceSnapshot = {
  totalBalls: 10_000,
  startRate: 0.1,
  outRate: 0.8,
  averageLifetime: 1,
  averageCollisionCount: 10,
  averageVelocity: 2,
  maxVelocity: 5,
  timeoutCount: 0,
  timeoutRate: 0,
  remainingBodies: 0,
  velocityClampCount: 0,
  finite: true,
};

describe("effective solver-step convergence", () => {
  it("reproduces the first display divergence without nails, arcs, sensors, or another ball", async () => {
    const fullBoard = await loadBoard();
    const display = fullBoard.mechanisms.find((mechanism) => mechanism.id === "center-display-collider");
    if (display === undefined) throw new Error("Missing center display collider");
    const board = {
      ...fullBoard,
      nails: [],
      arcRails: [],
      walls: [],
      sensors: [],
      rails: fullBoard.rails.filter((rail) => rail.id.startsWith("launch-")),
      gates: fullBoard.gates.filter((gate) => gate.id.startsWith("launch-")),
      mechanisms: [display],
    };
    const trace = async (substeps: number) => {
      const engine = await PachinkoPhysicsEngine.create({ board, seed: 123456, substeps });
      const displayContactTicks: number[] = [];
      engine.events.on("ball.collision", (event) => {
        if (event.colliderId === "center-display-collider/outline") displayContactTicks.push(event.tick);
      });
      engine.launch(0.68);
      for (let tick = 0; tick < 120; tick += 1) engine.step();
      engine.dispose();
      return displayContactTicks;
    };
    expect(await trace(16)).toEqual([48, 65, 71, 73, 89, 92, 93]);
    expect(await trace(32)).toEqual([48, 65, 70, 72, 89, 92]);
  });

  it("keeps outcomes and contacts identical when only Hz/substep factorisation changes", async () => {
    const board = await loadBoard();
    const common = { board, balls: 20, seed: 123456, launchPower: 0.68, fireRate: 100 as const, ccdEnabled: true };
    const at120x32 = await runBatch({ ...common, physicsHz: 120, substeps: 32 });
    const at240x16 = await runBatch({ ...common, physicsHz: 240, substeps: 16 });
    expect({
      start: at120x32.startWins,
      out: at120x32.outCount,
      other: at120x32.otherPocketEntries,
      collisions: at120x32.averageCollisionCount,
      averageVelocity: at120x32.averageVelocity,
      maxVelocity: at120x32.maxVelocity,
    }).toEqual({
      start: at240x16.startWins,
      out: at240x16.outCount,
      other: at240x16.otherPocketEntries,
      collisions: at240x16.averageCollisionCount,
      averageVelocity: at240x16.averageVelocity,
      maxVelocity: at240x16.maxVelocity,
    });
  });

  it("passes a controlled collision-free board at doubled substeps", async () => {
    const base = createBoardTemplate();
    const board = createBoardTemplate({
      physics: { ...base.physics, substeps: 1, maxBallLifetimeSeconds: 1 },
      launcher: { position: { x: 250, y: 50 }, strength: 1, angleDegrees: 0, minVelocity: 5, maxVelocity: 5, angleJitterDegrees: 0 },
      sensors: [{ id: "out", role: "OUT", center: { x: 250, y: 50 }, width: 100, height: 100 }],
    });
    const result = await runConvergence({ board, balls: 2, seed: 7 });
    expect(result.config).toMatchObject({ baselineSubsteps: 1, refinedSubsteps: 2, resolutionChanged: true });
    expect(result.checks).toEqual({
      startRate: true,
      outRate: true,
      averageLifetime: true,
      averageCollisionCount: true,
      averageVelocity: true,
      timeoutRate: true,
      remainingBodies: true,
      velocityClampCount: true,
      finite: true,
    });
    expect(result.pass).toBe(true);
  });

  it("fails deltas and safety values at or beyond the documented gates", () => {
    const result = evaluateConvergence(stable, {
      ...stable,
      startRate: 0.104,
      averageLifetime: 1.03,
      timeoutCount: 1,
      timeoutRate: 0.0001,
      remainingBodies: 1,
      velocityClampCount: 1,
    });
    expect(result.deltas.startRatePercentagePoints).toBeCloseTo(0.4);
    expect(result.checks).toMatchObject({
      startRate: false,
      averageLifetime: false,
      timeoutRate: false,
      remainingBodies: false,
      velocityClampCount: false,
    });
    expect(result.pass).toBe(false);
  });

  it("reports a 1000-ball rate difference as statistically inconclusive without hiding the point-gate failure", () => {
    const result = evaluateConvergence(
      { ...stable, totalBalls: 1000, startRate: 0.437, outRate: 0.322 },
      { ...stable, totalBalls: 1000, startRate: 0.421, outRate: 0.309 },
    );
    expect(result.checks.startRate).toBe(false);
    expect(result.checks.outRate).toBe(false);
    expect(result.rateUncertainty.startRate).toMatchObject({
      normalApproximationAdequate: true,
      classification: "INCONCLUSIVE",
    });
    expect(result.rateUncertainty.startRate.deltaPercentagePoints).toBeCloseTo(-1.6);
    expect(result.rateUncertainty.startRate.standardErrorPercentagePoints).toBeCloseTo(2.2131, 3);
    expect(result.rateUncertainty.startRate.confidence95PercentagePoints.lower).toBeLessThan(-0.3);
    expect(result.rateUncertainty.startRate.confidence95PercentagePoints.upper).toBeGreaterThan(0.3);
    expect(result.rateUncertainty.outRate.classification).toBe("INCONCLUSIVE");
    expect(result.pass).toBe(false);
  });

  it("distinguishes confirmed rate convergence from a confirmed rate regression at sufficient sample size", () => {
    const within = evaluateConvergence(
      { ...stable, totalBalls: 1_000_000, startRate: 0.4 },
      { ...stable, totalBalls: 1_000_000, startRate: 0.4001 },
    );
    const outside = evaluateConvergence(
      { ...stable, totalBalls: 1_000_000, startRate: 0.4 },
      { ...stable, totalBalls: 1_000_000, startRate: 0.42 },
    );
    expect(within.rateUncertainty.startRate.classification).toBe("CONFIRMED_WITHIN_GATE");
    expect(outside.rateUncertainty.startRate.classification).toBe("CONFIRMED_OUTSIDE_GATE");
    expect(RATE_UNCERTAINTY.worstCaseBallsPerResolutionForGateWidth).toBe(213_415);
  });

  it("does not claim rate evidence when the normal approximation is underpowered", () => {
    const result = evaluateConvergence(
      { ...stable, totalBalls: 2, startRate: 0 },
      { ...stable, totalBalls: 2, startRate: 0 },
    );
    expect(result.rateUncertainty.startRate).toMatchObject({
      normalApproximationAdequate: false,
      classification: "INCONCLUSIVE",
    });
  });
});
