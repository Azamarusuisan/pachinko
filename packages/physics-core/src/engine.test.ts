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
    let hits = 0; let speedBefore = 0;
    engine.events.on("nail.hit", (event) => { hits += 1; speedBefore = event.speedBefore; });
    engine.launch(1);
    let reflected = false;
    for (let index = 0; index < 100; index += 1) {
      engine.step();
      const ball = engine.snapshot().balls[0];
      if (ball !== undefined && ball.velocity.y < 0) reflected = true;
    }
    expect(hits).toBeGreaterThan(0);
    expect(speedBefore).toBeGreaterThan(1);
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

  it("bounces off the published shaft-scale nail at production speed", async () => {
    const board = makeTestBoard({
      physics: { ...makeTestBoard().physics, gravity: 0.001, physicsHz: 240, substeps: 16 },
      ball: { diameter: 11, massGrams: 5.45, friction: 0.12, restitution: 0.44 },
      launcher: { position: { x: 244.5, y: 50 }, angleDegrees: 90, minVelocity: 3.536, maxVelocity: 3.536, angleJitterDegrees: 0 },
      nails: [{ ...nail, positionX: 250, positionY: 100, radius: 0.92, friction: 0.18, restitution: 0.52 }],
    });
    const engine = await PachinkoPhysicsEngine.create({ board, seed: 27 });
    let hit = false;
    let beforeStep: { x: number; y: number } | undefined;
    let incoming: { x: number; y: number } | undefined;
    engine.events.on("nail.hit", () => {
      hit = true;
      incoming ??= beforeStep;
    });
    engine.launch(1);
    for (let index = 0; index < 80 && !hit; index += 1) {
      beforeStep = engine.snapshot().balls[0]?.velocity;
      engine.step();
    }
    const outgoing = engine.snapshot().balls[0]?.velocity;
    expect(hit).toBe(true);
    expect(incoming).toBeDefined();
    expect(outgoing).toBeDefined();
    const dot = ((incoming?.x ?? 0) * (outgoing?.x ?? 0) + (incoming?.y ?? 0) * (outgoing?.y ?? 0))
      / (Math.hypot(incoming?.x ?? 0, incoming?.y ?? 0) * Math.hypot(outgoing?.x ?? 0, outgoing?.y ?? 0));
    expect(Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI).toBeGreaterThan(30);
    engine.dispose();
  });

  it("converges on the outgoing velocity of a millimetre-scale nail collision", async () => {
    const outgoing = async (substeps: number) => {
      const board = makeTestBoard({
        physics: { ...makeTestBoard().physics, gravity: 0.001, physicsHz: 240, substeps },
        ball: { diameter: 11, massGrams: 5.55, friction: 0.12, restitution: 0.44 },
        launcher: { position: { x: 244, y: 50 }, angleDegrees: 90, minVelocity: 3.5, maxVelocity: 3.5, angleJitterDegrees: 0 },
        nails: [{ ...nail, positionX: 250, positionY: 100, radius: 1.25, friction: 0.18, restitution: 0.5 }],
      });
      const engine = await PachinkoPhysicsEngine.create({ board, seed: 20, substeps });
      let result: { x: number; y: number; angular: number } | undefined;
      engine.events.on("nail.hit", () => {
        const ball = engine.snapshot().balls[0];
        if (ball !== undefined) result = { x: ball.velocity.x, y: ball.velocity.y, angular: ball.angularVelocity };
      });
      engine.launch(1);
      for (let index = 0; index < 60 && result === undefined; index += 1) engine.step();
      engine.dispose();
      if (result === undefined) throw new Error("Expected nail collision");
      return result;
    };
    const at960Hz = await outgoing(4);
    const at1920Hz = await outgoing(8);
    expect(Math.hypot(at960Hz.x - at1920Hz.x, at960Hz.y - at1920Hz.y)).toBeLessThan(0.05);
    expect(Math.abs(at960Hz.angular - at1920Hz.angular)).toBeLessThan(5);
  });

  it("uses one continuous collider for a fixed display outline", async () => {
    const outgoing = async (substeps: number) => {
      const board = makeTestBoard({
        physics: { ...makeTestBoard().physics, gravity: 0.001, physicsHz: 240, substeps },
        launcher: { position: { x: 250, y: 100 }, angleDegrees: 90, minVelocity: 2, maxVelocity: 2, angleJitterDegrees: 0 },
        mechanisms: [{
          id: "display", adapter: "fixed-outline-v1", enabled: true,
          massGrams: 5, angularDamping: 0.8, angularVelocityDegreesPerSecond: 0,
          motion: "ROTATE", oscillationAmplitudeDegrees: 0, oscillationFrequencyHz: 0, phaseDegrees: 0,
          colliders: [
            { id: "top", from: { x: 200, y: 200 }, to: { x: 300, y: 200 }, thickness: 6, friction: 0.1, restitution: 0.4, bodyType: "FIXED" },
            { id: "right", from: { x: 300, y: 200 }, to: { x: 300, y: 300 }, thickness: 6, friction: 0.1, restitution: 0.4, bodyType: "FIXED" },
            { id: "bottom", from: { x: 300, y: 300 }, to: { x: 200, y: 300 }, thickness: 6, friction: 0.1, restitution: 0.4, bodyType: "FIXED" },
            { id: "left", from: { x: 200, y: 300 }, to: { x: 200, y: 200 }, thickness: 6, friction: 0.1, restitution: 0.4, bodyType: "FIXED" },
          ],
        }],
      });
      const engine = await PachinkoPhysicsEngine.create({ board, seed: 21, substeps });
      const hits: string[] = [];
      let velocityY = 0;
      engine.events.on("ball.collision", (event) => {
        if (event.colliderId !== "display/outline") return;
        hits.push(event.colliderId);
        velocityY = engine.snapshot().balls[0]?.velocity.y ?? 0;
      });
      engine.launch(1);
      for (let index = 0; index < 80 && hits.length === 0; index += 1) engine.step();
      engine.dispose();
      return { hits, velocityY };
    };
    const at960Hz = await outgoing(4);
    const at1920Hz = await outgoing(8);
    expect(at960Hz.hits).toEqual(["display/outline"]);
    expect(at1920Hz.hits).toEqual(["display/outline"]);
    expect(at960Hz.velocityY).toBeLessThan(0);
    expect(Math.abs(at960Hz.velocityY - at1920Hz.velocityY)).toBeLessThan(0.01);
  });

  it("uses one skinned polyline collider for a continuous arc rail", async () => {
    const outgoing = async (substeps: number) => {
      const board = makeTestBoard({
        physics: { ...makeTestBoard().physics, gravity: 0.001, physicsHz: 240, substeps },
        launcher: { position: { x: 250, y: 250 }, angleDegrees: 0, minVelocity: 2, maxVelocity: 2, angleJitterDegrees: 0 },
        arcRails: [{ id: "arc", center: { x: 250, y: 250 }, radius: 100, startAngleDegrees: -45, endAngleDegrees: 45, segments: 16, thickness: 4, friction: 0.1, restitution: 0.4 }],
      });
      const engine = await PachinkoPhysicsEngine.create({ board, seed: 22, substeps });
      const hits: string[] = [];
      let velocityX = 0;
      engine.events.on("ball.collision", (event) => {
        if (event.colliderId !== "arc") return;
        hits.push(event.colliderId);
        velocityX = engine.snapshot().balls[0]?.velocity.x ?? 0;
      });
      engine.launch(1);
      for (let index = 0; index < 80 && hits.length === 0; index += 1) engine.step();
      engine.dispose();
      return { hits, velocityX };
    };
    const at960Hz = await outgoing(4);
    const at1920Hz = await outgoing(8);
    expect(at960Hz.hits).toEqual(["arc"]);
    expect(at1920Hz.hits).toEqual(["arc"]);
    expect(at960Hz.velocityX).toBeLessThan(0);
    expect(Math.abs(at960Hz.velocityX - at1920Hz.velocityX)).toBeLessThan(0.01);
  });

  it("isolates repeated grazing contact-start sensitivity on one unjoined rail", async () => {
    const graze = async (substeps: number) => {
      const board = makeTestBoard({
        physics: { ...makeTestBoard().physics, substeps, linearDamping: 0.025, angularDamping: 0.04 },
        ball: { diameter: 11, massGrams: 5.45, friction: 0.12, restitution: 0.44 },
        launcher: { position: { x: 220, y: 138 }, angleDegrees: 180, minVelocity: 0.71, maxVelocity: 0.71, angleJitterDegrees: 0 },
        rails: [{ id: "single-slope", from: { x: 110, y: 170 }, to: { x: 250, y: 150 }, thickness: 7, friction: 0.12, restitution: 0.26 }],
      });
      const engine = await PachinkoPhysicsEngine.create({ board, seed: 24, substeps });
      const ticks: number[] = [];
      let first: {
        readonly position: { readonly x: number; readonly y: number };
        readonly velocity: { readonly x: number; readonly y: number };
        readonly point: { readonly x: number; readonly y: number };
        readonly normal: { readonly x: number; readonly y: number };
      } | undefined;
      engine.events.on("ball.collision", (event) => {
        if (event.colliderId !== "single-slope") return;
        ticks.push(event.tick);
        if (first !== undefined) return;
        const snapshot = engine.snapshot();
        const ball = snapshot.balls[0];
        const contact = [...snapshot.contacts].reverse().find((candidate) => candidate.colliderId === "single-slope");
        if (ball !== undefined && contact !== undefined) {
          first = { position: ball.position, velocity: ball.velocity, point: contact.point, normal: contact.normal };
        }
      });
      engine.launch(1);
      for (let tick = 0; tick < 80; tick += 1) engine.step();
      engine.dispose();
      if (first === undefined) throw new Error("Expected a grazing rail contact");
      return { ticks, first };
    };
    const at3840Hz = await graze(16);
    const at7680Hz = await graze(32);
    expect(at3840Hz.ticks).toEqual([12, 18, 20]);
    expect(at7680Hz.ticks).toEqual([12, 18]);
    expect(Math.hypot(
      at3840Hz.first.position.x - at7680Hz.first.position.x,
      at3840Hz.first.position.y - at7680Hz.first.position.y,
    )).toBeLessThan(0.0001);
    expect(Math.hypot(
      at3840Hz.first.point.x - at7680Hz.first.point.x,
      at3840Hz.first.point.y - at7680Hz.first.point.y,
    )).toBeLessThan(0.00001);
    expect(Math.hypot(
      at3840Hz.first.normal.x - at7680Hz.first.normal.x,
      at3840Hz.first.normal.y - at7680Hz.first.normal.y,
    )).toBeLessThan(0.00001);
    expect(Math.hypot(
      at3840Hz.first.velocity.x - at7680Hz.first.velocity.x,
      at3840Hz.first.velocity.y - at7680Hz.first.velocity.y,
    )).toBeLessThan(0.00001);
  });

  it("keeps the launcher contact order and release velocity convergent", async () => {
    const released = async (substeps: number) => {
      const board = makeTestBoard({
        physics: { ...makeTestBoard().physics, substeps, linearDamping: 0.025, angularDamping: 0.04 },
        ball: { diameter: 11, massGrams: 5.45, friction: 0.12, restitution: 0.44 },
        launcher: { position: { x: 32, y: 455 }, angleDegrees: -80, minVelocity: 3.536, maxVelocity: 3.536, angleJitterDegrees: 0 },
        rails: [
          { id: "launch-outer", from: { x: 14, y: 476 }, to: { x: 14, y: 130 }, thickness: 4, friction: 0.06, restitution: 0.3 },
          { id: "launch-release", from: { x: 14, y: 125 }, to: { x: 55, y: 57 }, thickness: 4, friction: 0.06, restitution: 0.38 },
        ],
        gates: [{ id: "launch-inner-one-way", from: { x: 53, y: 470 }, to: { x: 53, y: 155 }, thickness: 4, friction: 0.06, restitution: 0.3, enabled: true, collisionMode: "BIDIRECTIONAL" }],
      });
      const engine = await PachinkoPhysicsEngine.create({ board, seed: 23, substeps });
      const contacts: string[] = [];
      let releaseState: {
        readonly position: { readonly x: number; readonly y: number };
        readonly velocity: { readonly x: number; readonly y: number };
        readonly contactPoint: { readonly x: number; readonly y: number };
        readonly contactNormal: { readonly x: number; readonly y: number };
      } | undefined;
      engine.events.on("ball.collision", (event) => {
        contacts.push(event.colliderId);
        if (event.colliderId !== "launch-release") return;
        const snapshot = engine.snapshot();
        const ball = snapshot.balls[0];
        const contact = [...snapshot.contacts].reverse().find((candidate) => candidate.colliderId === "launch-release");
        if (ball !== undefined && contact !== undefined) {
          releaseState = {
            position: ball.position,
            velocity: ball.velocity,
            contactPoint: contact.point,
            contactNormal: contact.normal,
          };
        }
      });
      engine.launch(1);
      for (let tick = 0; tick < 100 && releaseState === undefined; tick += 1) engine.step();
      engine.dispose();
      if (releaseState === undefined) throw new Error("Expected launcher release contact state");
      return { contacts, releaseState };
    };
    const at3840Hz = await released(16);
    const at7680Hz = await released(32);
    expect(at3840Hz.contacts).toEqual(["launch-inner-one-way", "launch-release"]);
    expect(at7680Hz.contacts).toEqual(at3840Hz.contacts);
    expect(Math.hypot(
      at3840Hz.releaseState.position.x - at7680Hz.releaseState.position.x,
      at3840Hz.releaseState.position.y - at7680Hz.releaseState.position.y,
    )).toBeLessThan(0.001);
    expect(Math.hypot(
      at3840Hz.releaseState.contactPoint.x - at7680Hz.releaseState.contactPoint.x,
      at3840Hz.releaseState.contactPoint.y - at7680Hz.releaseState.contactPoint.y,
    )).toBeLessThan(0.001);
    expect(Math.hypot(
      at3840Hz.releaseState.contactNormal.x - at7680Hz.releaseState.contactNormal.x,
      at3840Hz.releaseState.contactNormal.y - at7680Hz.releaseState.contactNormal.y,
    )).toBeLessThan(0.00001);
    expect(Math.hypot(
      at3840Hz.releaseState.velocity.x - at7680Hz.releaseState.velocity.x,
      at3840Hz.releaseState.velocity.y - at7680Hz.releaseState.velocity.y,
    )).toBeLessThan(0.01);
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

  it("measures abnormal speed before applying an explicitly configured clamp", async () => {
    const board = makeTestBoard({
      physics: { gravity: 0.001, substeps: 2 },
      ball: { maxVelocity: 10 },
      launcher: { position: { x: 50, y: 250 }, angleDegrees: 0, minVelocity: 80, maxVelocity: 80, angleJitterDegrees: 0 },
    });
    const engine = await PachinkoPhysicsEngine.create({ board, seed: 16 });
    engine.launch(1);
    engine.step();
    const diagnostics = engine.diagnostics();
    const velocity = engine.snapshot().balls[0]?.velocity;
    expect(diagnostics.maxObservedVelocity).toBeGreaterThan(70);
    expect(diagnostics.velocityClampCount).toBeGreaterThan(0);
    expect(Math.hypot(velocity?.x ?? 0, velocity?.y ?? 0)).toBeLessThanOrEqual(10.000001);
    engine.dispose();
  });

  it("traces fast heatmap segments without skipped cells or physics-Hz passage drift", async () => {
    const base = makeTestBoard({
      physics: { gravity: 0.001 },
      launcher: { position: { x: 50, y: 250 }, angleDegrees: 0, minVelocity: 80, maxVelocity: 80, angleJitterDegrees: 0 },
    });
    const fast = await PachinkoPhysicsEngine.create({ board: base, seed: 22, physicsHz: 120, heatmapCellSizeMillimeters: 25 });
    fast.launch(1);
    fast.step();
    expect(fast.heatmapResult()?.cells.filter((cell) => cell.row === 10 && cell.ballPassages > 0).map((cell) => cell.column))
      .toEqual(Array.from({ length: 18 }, (_, index) => index + 2));
    fast.dispose();

    const passagePattern = async (physicsHz: 120 | 240) => {
      const board = makeTestBoard({
        physics: { gravity: 0.001 },
        launcher: { position: { x: 50, y: 250 }, angleDegrees: 0, minVelocity: 0.6, maxVelocity: 0.6, angleJitterDegrees: 0 },
      });
      const engine = await PachinkoPhysicsEngine.create({ board, seed: 22, physicsHz, heatmapCellSizeMillimeters: 25 });
      engine.launch(1);
      for (let index = 0; index < physicsHz * 0.45; index += 1) engine.step();
      const pattern = engine.heatmapResult()?.cells
        .filter((cell) => cell.ballPassages > 0)
        .map((cell) => `${cell.row}:${cell.column}:${cell.ballPassages}`);
      engine.dispose();
      return pattern;
    };
    expect(await passagePattern(120)).toEqual(await passagePattern(240));
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
        massGrams: 5, angularDamping: 0.8,
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

  it("publishes moving collider transforms from Rapier as the render source of truth", async () => {
    const board = makeTestBoard({
      mechanisms: [{
        id: "windmill", adapter: "rotating-windmill-v1", enabled: true,
        massGrams: 5, angularDamping: 0.8,
        angularVelocityDegreesPerSecond: 90, motion: "ROTATE", oscillationAmplitudeDegrees: 0,
        oscillationFrequencyHz: 0, phaseDegrees: 0,
        colliders: [{ id: "blade", from: { x: 220, y: 100 }, to: { x: 280, y: 100 }, thickness: 4, friction: 0.1, restitution: 0.3, bodyType: "KINEMATIC" }],
      }],
    });
    const engine = await PachinkoPhysicsEngine.create({ board, seed: 14 });
    const before = engine.snapshot().mechanisms[0];
    for (let index = 0; index < 60; index += 1) engine.step();
    const after = engine.snapshot().mechanisms[0];
    expect(before?.mechanismId).toBe("windmill");
    expect(after?.rotation).not.toBe(before?.rotation);
    expect(Math.hypot((after?.to.x ?? 0) - (after?.from.x ?? 0), (after?.to.y ?? 0) - (after?.from.y ?? 0))).toBeCloseTo(0.06);
    engine.dispose();
  });

  it("keeps a passive windmill still until a ball transfers angular momentum", async () => {
    const board = makeTestBoard({
      launcher: { position: { x: 270, y: 70 }, angleDegrees: 90, minVelocity: 1.2, maxVelocity: 1.2, angleJitterDegrees: 0 },
      mechanisms: [{
        id: "windmill", adapter: "passive-windmill-v1", enabled: true,
        pivot: { x: 250, y: 150 }, massGrams: 5, angularDamping: 0.8,
        angularVelocityDegreesPerSecond: 0, motion: "ROTATE", oscillationAmplitudeDegrees: 0,
        oscillationFrequencyHz: 0, phaseDegrees: 0,
        colliders: [
          { id: "blade-a", from: { x: 220, y: 150 }, to: { x: 280, y: 150 }, thickness: 3, friction: 0.16, restitution: 0.32, bodyType: "DYNAMIC" },
          { id: "blade-b", from: { x: 250, y: 120 }, to: { x: 250, y: 180 }, thickness: 3, friction: 0.16, restitution: 0.32, bodyType: "DYNAMIC" },
        ],
      }],
    });
    const engine = await PachinkoPhysicsEngine.create({ board, seed: 19 });
    const initial = engine.snapshot().mechanisms[0]?.rotation ?? 0;
    for (let index = 0; index < 20; index += 1) engine.step();
    expect(engine.snapshot().mechanisms[0]?.rotation).toBeCloseTo(initial, 10);
    engine.launch(1);
    for (let index = 0; index < 100; index += 1) engine.step();
    expect(Math.abs((engine.snapshot().mechanisms[0]?.rotation ?? initial) - initial)).toBeGreaterThan(0.05);
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

  it("requires the ball centre to fit through the START mouth", async () => {
    const start = { id: "start", role: "START", center: { x: 250, y: 100 }, width: 13, height: 1 } as const;
    const run = async (launchX: number) => {
      const board = makeTestBoard({
        launcher: { position: { x: launchX, y: 50 }, angleDegrees: 90, minVelocity: 1, maxVelocity: 1, angleJitterDegrees: 0 },
        sensors: [start],
        physics: { ...makeTestBoard().physics, maxBallLifetimeSeconds: 0.3 },
      });
      const engine = await PachinkoPhysicsEngine.create({ board, seed: 25 });
      engine.launch(1);
      while (engine.completedBalls.length === 0) engine.step();
      const terminal = engine.completedBalls[0]?.terminal;
      engine.dispose();
      return terminal;
    };
    expect(await run(250)).toBe("start");
    expect(await run(244)).not.toBe("start");
  });

  it("captures START before a later OUT crossed in the same substep", async () => {
    const board = makeTestBoard({
      launcher: { position: { x: 250, y: 50 }, angleDegrees: 90, minVelocity: 20, maxVelocity: 20, angleJitterDegrees: 0 },
      sensors: [
        { id: "start", role: "START", center: { x: 250, y: 70 }, width: 40, height: 1 },
        { id: "out", role: "OUT", center: { x: 250, y: 80 }, width: 40, height: 1 },
      ],
    });
    const engine = await PachinkoPhysicsEngine.create({ board, seed: 26, substeps: 1 });
    engine.launch(1);
    while (engine.completedBalls.length === 0) engine.step();
    expect(engine.completedBalls[0]?.terminal).toBe("start");
    engine.dispose();
  });

  it("freezes a captured ball and measures lifetime at entry instead of visual retention", async () => {
    const board = makeTestBoard({
      sensors: [
        { id: "start", role: "START", center: { x: 250, y: 100 }, width: 40, height: 10 },
        { id: "out", role: "OUT", center: { x: 250, y: 120 }, width: 40, height: 10 },
      ],
      physics: { ...makeTestBoard().physics, terminalRetentionSeconds: 0.2 },
    });
    const engine = await PachinkoPhysicsEngine.create({ board, seed: 17 });
    const roles: string[] = [];
    let enteredAt = -1;
    engine.events.on("sensor.enter", (event) => {
      roles.push(event.role);
      if (event.role === "START") enteredAt = event.simulationTime;
    });
    engine.launch(1);
    while (enteredAt < 0) engine.step();
    const captured = engine.snapshot().balls[0]?.position;
    for (let index = 0; index < 20; index += 1) engine.step();
    expect(engine.snapshot().balls[0]?.position).toEqual(captured);
    expect(engine.diagnostics()).toMatchObject({ activeBallCount: 1, dynamicBodyCount: 0 });
    while (engine.completedBalls.length === 0) engine.step();
    expect(roles).toEqual(["START"]);
    expect(engine.completedBalls[0]?.lifetime).toBeCloseTo(enteredAt, 10);
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

    const upperBoard = makeTestBoard({
      physics: { ...makeTestBoard().physics, gravity: 0.001, maxBallLifetimeSeconds: 0.05 },
      launcher: { position: { x: 250, y: 10 }, angleDegrees: -90, minVelocity: 1, maxVelocity: 1, angleJitterDegrees: 0 },
    });
    const upperEngine = await PachinkoPhysicsEngine.create({ board: upperBoard, seed: 18 });
    upperEngine.launch(1);
    while (upperEngine.completedBalls.length === 0) upperEngine.step();
    expect(upperEngine.completedBalls[0]?.terminal).toBe("timeout");
    upperEngine.dispose();
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

  it("preserves every route enter and counts sensor roles", async () => {
    const board = makeTestBoard({
      sensors: [
        { id: "left-route", role: "ROUTE_LEFT", center: { x: 250, y: 80 }, width: 40, height: 8 },
        { id: "through", role: "THROUGH", center: { x: 250, y: 100 }, width: 40, height: 8 },
        { id: "center-route", role: "ROUTE_CENTER", center: { x: 250, y: 120 }, width: 40, height: 8 },
        { id: "out", role: "OUT", center: { x: 250, y: 145 }, width: 40, height: 8 },
      ],
    });
    const engine = await PachinkoPhysicsEngine.create({ board, seed: 21 });
    engine.launch(1);
    while (engine.completedBalls.length === 0) engine.step();
    expect(engine.completedBalls[0]).toMatchObject({
      route: "left",
      routeSequence: ["left", "center"],
      sensorEnterCounts: { ROUTE_LEFT: 1, THROUGH: 1, ROUTE_CENTER: 1, OUT: 1 },
      otherSensorCount: 1,
    });
    engine.dispose();
  });

  it("emits WARP before an optional safe teleport and preserves velocity", async () => {
    const board = makeTestBoard({
      sensors: [
        { id: "warp", role: "WARP", center: { x: 250, y: 100 }, width: 40, height: 12, warp: { destinationSensorId: "destination", destinationOffset: { x: 0, y: 20 }, velocityMode: "PRESERVE" } },
        { id: "destination", role: "ROUTE_RIGHT", center: { x: 400, y: 300 }, width: 20, height: 12 },
      ],
    });
    const engine = await PachinkoPhysicsEngine.create({ board, seed: 15 });
    let destination: string | null = null;
    engine.events.on("warp.enter", (event) => { destination = event.destinationSensorId; });
    engine.launch(1);
    for (let index = 0; index < 120 && destination === null; index += 1) engine.step();
    const ball = engine.snapshot().balls[0];
    expect(destination).toBe("destination");
    expect(ball?.position.x).toBeGreaterThan(0.39);
    expect(ball?.position.y).toBeGreaterThan(0.3);
    expect(Math.hypot(ball?.velocity.x ?? 0, ball?.velocity.y ?? 0)).toBeGreaterThan(0);
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
