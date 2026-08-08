import { describe, expect, it } from "vitest";
import { PachinkoPhysicsEngine } from "./engine.js";
import { makeTestBoard } from "./test-board.js";

const nail = { id: "nail", positionX: 250, positionY: 100, radius: 2, friction: 0, restitution: 0.9, enabled: true, group: "test" } as const;

describe("Rapier pachinko physics", () => {
  it("falls under configured gravity", async () => {
    const engine = await PachinkoPhysicsEngine.create({ board: makeTestBoard(), seed: 1 });
    engine.launch(0);
    const initialY = engine.snapshot().balls[0]?.position.y ?? 0;
    for (let index = 0; index < 60; index += 1) engine.step();
    const ball = engine.snapshot().balls[0];
    expect(ball?.position.y).toBeGreaterThan(initialY);
    expect(ball?.velocity.y).toBeGreaterThan(0);
    engine.dispose();
  });

  it("collides with a nail and reflects", async () => {
    const board = makeTestBoard({ nails: [nail], launcher: { position: { x: 250, y: 50 }, angleDegrees: 90, minVelocity: 1.2, maxVelocity: 1.2, angleJitterDegrees: 0 } });
    const engine = await PachinkoPhysicsEngine.create({ board, seed: 2 });
    let hits = 0;
    engine.events.on("nail.hit", () => { hits += 1; });
    engine.launch(1);
    let reflected = false;
    for (let index = 0; index < 100; index += 1) {
      engine.step();
      const ball = engine.snapshot().balls[0];
      if (ball !== undefined && ball.velocity.y < 0) reflected = true;
    }
    expect(hits).toBeGreaterThan(0);
    expect(reflected).toBe(true);
    expect(engine.snapshot().balls[0]?.collisionCount).toBeGreaterThan(0);
    engine.dispose();
  });

  it("resolves a millimetre-scale grazing nail hit without tunnelling", async () => {
    const board = makeTestBoard({
      physics: { ...makeTestBoard().physics, gravity: 0.001, physicsHz: 240 },
      ball: { diameter: 11, massGrams: 5.55, friction: 0.12, restitution: 0.44 },
      launcher: { position: { x: 244, y: 50 }, angleDegrees: 90, minVelocity: 5.2, maxVelocity: 5.2, angleJitterDegrees: 0 },
      nails: [{ ...nail, positionX: 250, positionY: 100, radius: 1.25, friction: 0.18, restitution: 0.52 }],
    });
    const engine = await PachinkoPhysicsEngine.create({ board, seed: 12, ccdEnabled: true });
    let hits = 0;
    engine.events.on("nail.hit", () => { hits += 1; });
    engine.launch(1);
    let deflectedLeft = false;
    let finite = true;
    for (let index = 0; index < 30; index += 1) {
      engine.step();
      const ball = engine.snapshot().balls[0];
      if (ball !== undefined) {
        deflectedLeft ||= ball.velocity.x < -0.1;
        finite &&= Number.isFinite(ball.position.x) && Number.isFinite(ball.position.y) && Number.isFinite(ball.angularVelocity);
      }
    }
    expect(hits).toBe(1);
    expect(deflectedLeft).toBe(true);
    expect(finite).toBe(true);
    engine.dispose();
  });

  it("uses CCD to stop a deliberately tunnelling high-speed ball", async () => {
    const board = makeTestBoard({
      physics: { ...makeTestBoard().physics, gravity: 0.001, physicsHz: 120 },
      launcher: { position: { x: 50, y: 250 }, angleDegrees: 0, minVelocity: 80, maxVelocity: 80, angleJitterDegrees: 0 },
      nails: [{ ...nail, positionX: 250, positionY: 250, radius: 1 }],
    });
    const withCcd = await PachinkoPhysicsEngine.create({ board, seed: 3, ccdEnabled: true });
    const withoutCcd = await PachinkoPhysicsEngine.create({ board, seed: 3, ccdEnabled: false });
    let ccdHit = 0;
    let discreteHit = 0;
    withCcd.events.on("nail.hit", () => { ccdHit += 1; });
    withoutCcd.events.on("nail.hit", () => { discreteHit += 1; });
    withCcd.launch(1); withoutCcd.launch(1);
    withCcd.step(); withoutCcd.step();
    withCcd.step(); withoutCcd.step();
    expect(ccdHit).toBe(1);
    expect(discreteHit).toBe(0);
    expect(withCcd.snapshot().balls[0]?.velocity.x).toBeLessThan(0);
    expect(withoutCcd.snapshot().balls[0]?.position.x).toBeGreaterThan(0.5);
    withCcd.dispose(); withoutCcd.dispose();
  });

  it("moves along a rail without crossing it", async () => {
    const board = makeTestBoard({
      launcher: { position: { x: 100, y: 200 }, angleDegrees: 0, minVelocity: 0.8, maxVelocity: 0.8, angleJitterDegrees: 0 },
      rails: [{ id: "rail", from: { x: 50, y: 220 }, to: { x: 450, y: 220 }, thickness: 4, friction: 0, restitution: 0.1 }],
    });
    const engine = await PachinkoPhysicsEngine.create({ board, seed: 4 });
    engine.launch(1);
    for (let index = 0; index < 80; index += 1) engine.step();
    const ball = engine.snapshot().balls[0];
    expect(ball?.position.x).toBeGreaterThan(0.1);
    expect(ball?.position.y).toBeLessThan(0.215);
    expect(ball?.collisionCount).toBeGreaterThan(0);
    engine.dispose();
  });

  it("collides with a physically oscillating hanemono wing", async () => {
    const board = makeTestBoard({
      physics: { ...makeTestBoard().physics, gravity: 0.001 },
      launcher: { position: { x: 250, y: 50 }, angleDegrees: 90, minVelocity: 1, maxVelocity: 1, angleJitterDegrees: 0 },
      mechanisms: [{
        id: "hanemono-wing", adapter: "oscillating-wing-v1", enabled: true,
        angularVelocityDegreesPerSecond: 0, motion: "OSCILLATE", oscillationAmplitudeDegrees: 22,
        oscillationFrequencyHz: 2, phaseDegrees: 0,
        colliders: [{ id: "blade", from: { x: 220, y: 100 }, to: { x: 280, y: 100 }, thickness: 4, friction: 0.12, restitution: 0.35, bodyType: "KINEMATIC" }],
      }],
    });
    const engine = await PachinkoPhysicsEngine.create({ board, seed: 13 });
    let wingHits = 0;
    engine.events.on("ball.collision", (event) => { if (event.colliderId === "hanemono-wing/blade") wingHits += 1; });
    engine.launch(1);
    for (let index = 0; index < 120; index += 1) engine.step();
    expect(wingHits).toBeGreaterThan(0);
    expect(engine.diagnostics().finite).toBe(true);
    engine.dispose();
  });

  it("fires START enter once and completes lifecycle with cleanup", async () => {
    const board = makeTestBoard({
      sensors: [{ id: "start", role: "START", center: { x: 250, y: 100 }, width: 40, height: 15 }],
      physics: { ...makeTestBoard().physics, terminalRetentionSeconds: 0.03 },
    });
    const engine = await PachinkoPhysicsEngine.create({ board, seed: 5 });
    let enters = 0; let destroyed = 0;
    engine.events.on("sensor.enter", (event) => { if (event.sensorId === "start") enters += 1; });
    engine.events.on("ball.destroyed", () => { destroyed += 1; });
    engine.launch(1);
    for (let index = 0; index < 180 && engine.completedBalls.length === 0; index += 1) engine.step();
    expect(enters).toBe(1);
    expect(destroyed).toBe(1);
    expect(engine.completedBalls[0]?.terminal).toBe("start");
    expect(engine.diagnostics().dynamicBodyCount).toBe(0);
    engine.dispose();
  });

  it("detects OUT and completes timeout lifecycle", async () => {
    const outBoard = makeTestBoard({ sensors: [{ id: "out", role: "OUT", center: { x: 250, y: 100 }, width: 40, height: 15 }] });
    const outEngine = await PachinkoPhysicsEngine.create({ board: outBoard, seed: 6 });
    let outEvents = 0;
    outEngine.events.on("ball.out", () => { outEvents += 1; });
    outEngine.launch(1);
    for (let index = 0; index < 180 && outEngine.completedBalls.length === 0; index += 1) outEngine.step();
    expect(outEvents).toBe(1);
    expect(outEngine.completedBalls[0]?.terminal).toBe("out");
    outEngine.dispose();

    const timeoutBoard = makeTestBoard({ physics: { ...makeTestBoard().physics, maxBallLifetimeSeconds: 0.05 } });
    const timeoutEngine = await PachinkoPhysicsEngine.create({ board: timeoutBoard, seed: 7 });
    timeoutEngine.launch(0);
    for (let index = 0; index < 30 && timeoutEngine.completedBalls.length === 0; index += 1) timeoutEngine.step();
    expect(timeoutEngine.completedBalls[0]?.terminal).toBe("timeout");
    expect(timeoutEngine.diagnostics().dynamicBodyCount).toBe(0);
    timeoutEngine.dispose();
  });

  it("keeps a THROUGH pass non-terminal and terminates at the right-side attacker", async () => {
    const board = makeTestBoard({
      sensors: [
        { id: "through", role: "THROUGH", center: { x: 250, y: 85 }, width: 40, height: 10 },
        { id: "attacker", role: "ATTACKER", center: { x: 250, y: 125 }, width: 40, height: 10 },
      ],
    });
    const engine = await PachinkoPhysicsEngine.create({ board, seed: 8 });
    const roles: string[] = [];
    engine.events.on("sensor.enter", (event) => { roles.push(event.role); });
    engine.launch(1);
    for (let index = 0; index < 240 && engine.completedBalls.length === 0; index += 1) engine.step();
    expect(roles).toContain("THROUGH");
    expect(roles).toContain("ATTACKER");
    expect(engine.completedBalls[0]?.terminal).toBe("otherPocket");
    engine.dispose();
  });

  it("collects a ball that escapes the cabinet as OUT", async () => {
    const board = makeTestBoard({
      physics: { ...makeTestBoard().physics, gravity: 0.001 },
      launcher: { position: { x: 490, y: 490 }, angleDegrees: 90, minVelocity: 5, maxVelocity: 5, angleJitterDegrees: 0 },
    });
    const engine = await PachinkoPhysicsEngine.create({ board, seed: 9 });
    let sensorId = "";
    engine.events.on("ball.out", (event) => { sensorId = event.sensorId; });
    engine.launch(1);
    for (let index = 0; index < 120 && engine.completedBalls.length === 0; index += 1) engine.step();
    expect(sensorId).toBe("world-boundary");
    expect(engine.completedBalls[0]?.terminal).toBe("out");
    expect(engine.diagnostics().dynamicBodyCount).toBe(0);
    engine.dispose();
  });

  it("collides with an UPWARD_ONLY gate while rising and passes it while falling", async () => {
    const gate = { id: "one-way", from: { x: 100, y: 200 }, to: { x: 400, y: 200 }, thickness: 4, friction: 0, restitution: 0.2, enabled: true, collisionMode: "UPWARD_ONLY" } as const;
    const rising = await PachinkoPhysicsEngine.create({ board: makeTestBoard({ physics: { ...makeTestBoard().physics, gravity: 0.001 }, launcher: { position: { x: 250, y: 250 }, angleDegrees: -90, minVelocity: 1, maxVelocity: 1, angleJitterDegrees: 0 }, gates: [gate] }), seed: 10 });
    rising.launch(1);
    for (let index = 0; index < 30; index += 1) rising.step();
    expect(rising.snapshot().balls[0]?.position.y).toBeGreaterThan(0.2);
    expect(rising.snapshot().balls[0]?.collisionCount).toBeGreaterThan(0);
    rising.dispose();

    const falling = await PachinkoPhysicsEngine.create({ board: makeTestBoard({ physics: { ...makeTestBoard().physics, gravity: 0.001 }, launcher: { position: { x: 250, y: 150 }, angleDegrees: 90, minVelocity: 1, maxVelocity: 1, angleJitterDegrees: 0 }, gates: [gate] }), seed: 11 });
    falling.launch(1);
    for (let index = 0; index < 30; index += 1) falling.step();
    expect(falling.snapshot().balls[0]?.position.y).toBeGreaterThan(0.2);
    expect(falling.snapshot().balls[0]?.collisionCount).toBe(0);
    falling.dispose();
  });
});
