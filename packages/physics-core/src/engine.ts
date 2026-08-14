import RAPIER from "@dimforge/rapier2d-compat";
import { toSI, type ArcRailMeters, type BoardSI, type SegmentMeters } from "@pachinko/board-schema";
import { TypedEventBus, type PhysicsEvent } from "@pachinko/event-system";
import { Mulberry32 } from "./rng.js";
import { PHYSICS_VERSION, type BallSnapshot, type BallState, type CollisionVelocitySummary, type CompletedBall, type DebugContact, type EngineOptions, type HeatmapResult, type InputCommand, type PhysicsDiagnostics, type ReplayLog, type Route, type SensorRole, type SimulationSnapshot, type TrajectoryCellSummary, type TrajectorySample } from "./types.js";

interface BallRecord {
  readonly id: string;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  previousPosition: { x: number; y: number };
  state: BallState;
  readonly spawnTime: number;
  collisionCount: number;
  nailCollisionCount: number;
  railCollisionCount: number;
  windmillCollisionCount: number;
  otherSensorCount: number;
  velocitySampleCount: number;
  velocitySum: number;
  maxVelocity: number;
  velocityClampCount: number;
  collisionVelocity: CollisionVelocitySummary;
  lastHeatmapCell: number | null;
  lastWarpTick: number;
  readonly trajectory?: Map<number, MutableTrajectoryCell>;
  readonly trajectorySamples?: TrajectorySample[];
  route: Route | null;
  readonly routeSequence: Route[];
  readonly sensorEnterCounts: Partial<Record<SensorRole, number>>;
  terminal?: CompletedBall["terminal"];
  terminalTime?: number;
}

interface StaticColliderMeta {
  readonly id: string;
  readonly kind: "nail" | "sensor" | "rail" | "wall" | "gate" | "mechanism";
  readonly role?: SensorRole;
  readonly metricKind: "nail" | "rail" | "windmill" | "other";
  readonly warp?: NonNullable<BoardSI["sensors"][number]["warpMeters"]>;
}

interface MutableTrajectoryCell {
  passages: number;
  collisions: number;
  velocitySamples: number;
  velocitySum: number;
}

interface HeatmapAccumulator {
  readonly cellSizeMeters: number;
  readonly columns: number;
  readonly rows: number;
  readonly passages: Uint32Array;
  readonly collisions: Uint32Array;
  readonly velocitySamples: Uint32Array;
  readonly velocitySums: Float64Array;
  readonly outcomes: Record<CompletedBall["terminal"], HeatmapArrays>;
}

type HeatmapArrays = Pick<HeatmapAccumulator, "passages" | "collisions" | "velocitySamples" | "velocitySums">;

let rapierReady: Promise<void> | null = null;
export function initializeRapier(): Promise<void> {
  const ready = rapierReady ?? RAPIER.init();
  rapierReady = ready;
  return ready;
}

function segmentBody(world: RAPIER.World, segment: SegmentMeters, activeEvents = false, kinematic = false): RAPIER.Collider {
  const dx = segment.to.x - segment.from.x;
  const dy = segment.to.y - segment.from.y;
  const length = Math.hypot(dx, dy);
  const bodyDesc = kinematic ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.fixed();
  const body = world.createRigidBody(
    bodyDesc
      .setTranslation((segment.from.x + segment.to.x) / 2, (segment.from.y + segment.to.y) / 2)
      .setRotation(Math.atan2(dy, dx) + Math.PI / 2),
  );
  const desc = RAPIER.ColliderDesc.capsule(length / 2, segment.thickness / 2)
    .setFriction(segment.friction)
    .setRestitution(segment.restitution);
  if (activeEvents) desc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  return world.createCollider(desc, body);
}

function fixedOutlineBody(world: RAPIER.World, id: string, segments: readonly SegmentMeters[]): RAPIER.Collider {
  const first = segments[0];
  if (first === undefined || segments.length < 3) throw new Error(`Fixed outline requires at least three segments: ${id}`);
  const equal = (a: SegmentMeters["from"], b: SegmentMeters["from"]) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-9;
  if (segments.some((segment) => segment.thickness !== first.thickness || segment.friction !== first.friction || segment.restitution !== first.restitution)) {
    throw new Error(`Fixed outline requires one material and thickness: ${id}`);
  }
  const remaining = segments.slice(1);
  const vertices = [first.from, first.to];
  while (remaining.length > 0) {
    const last = vertices.at(-1);
    const index = remaining.findIndex((segment) => last !== undefined && (equal(segment.from, last) || equal(segment.to, last)));
    if (index < 0 || last === undefined) throw new Error(`Fixed outline is disconnected: ${id}`);
    const [segment] = remaining.splice(index, 1);
    if (segment === undefined) throw new Error(`Fixed outline segment missing: ${id}`);
    vertices.push(equal(segment.from, last) ? segment.to : segment.from);
  }
  if (!equal(vertices.at(-1) ?? first.to, first.from)) throw new Error(`Fixed outline is not closed: ${id}`);
  vertices.pop();
  const desc = RAPIER.ColliderDesc.roundConvexPolyline(
    new Float32Array(vertices.flatMap((point) => [point.x, point.y])),
    first.thickness / 2,
  );
  if (desc === null) throw new Error(`Fixed outline is not convex: ${id}`);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  return world.createCollider(desc
    .setFriction(first.friction)
    .setRestitution(first.restitution)
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
}

function arcRailBody(world: RAPIER.World, arc: ArcRailMeters): RAPIER.Collider {
  const vertices = Array.from({ length: arc.segments + 1 }, (_, index) => {
    const angle = arc.startAngleRadians + (arc.endAngleRadians - arc.startAngleRadians) * index / arc.segments;
    return [arc.center.x + Math.cos(angle) * arc.radius, arc.center.y + Math.sin(angle) * arc.radius];
  }).flat();
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  return world.createCollider(RAPIER.ColliderDesc.polyline(new Float32Array(vertices))
    .setContactSkin(arc.thickness / 2)
    .setFriction(arc.friction)
    .setRestitution(arc.restitution)
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
}

export class PachinkoPhysicsEngine {
  readonly events = new TypedEventBus();
  readonly board: BoardSI;
  readonly fixedDt: number;
  readonly physicsHz: 120 | 240 | 480;
  private readonly world: RAPIER.World;
  private readonly eventQueue = new RAPIER.EventQueue(true);
  private readonly rng: Mulberry32;
  private readonly balls = new Map<string, BallRecord>();
  private readonly colliderToBall = new Map<number, string>();
  private readonly staticColliders = new Map<number, StaticColliderMeta>();
  private readonly commands: InputCommand[] = [];
  private readonly inputLog: InputCommand[] = [];
  private readonly completed: CompletedBall[] = [];
  private readonly recentContacts: Array<DebugContact & { readonly expiresAtTick: number }> = [];
  private readonly movingMechanisms: Array<{ readonly mechanismId: string; readonly colliderId: string; readonly body: RAPIER.RigidBody; readonly driven: boolean; readonly localCenter: { readonly x: number; readonly y: number }; readonly localRotation: number; readonly motion: "ROTATE" | "OSCILLATE"; readonly baseRotation: number; readonly angularVelocity: number; readonly amplitude: number; readonly frequency: number; readonly phase: number; readonly length: number; readonly thickness: number }> = [];
  private nextBallId = 1;
  private tickValue = 0;
  private ccdEnabled: boolean;
  private lastStepDurationMs = 0;
  private readonly substeps: number;
  private readonly heatmap: HeatmapAccumulator | null;
  private readonly startSensors: BoardSI["sensors"];
  private velocityClampCount = 0;
  private velocitySampleCount = 0;
  private velocitySum = 0;
  private maxObservedVelocity = 0;

  private constructor(private readonly options: EngineOptions) {
    this.board = toSI(options.board);
    this.physicsHz = options.physicsHz ?? options.board.physics.physicsHz;
    this.fixedDt = 1 / this.physicsHz;
    this.substeps = options.substeps ?? options.board.physics.substeps;
    if (!Number.isInteger(this.substeps) || this.substeps < 1 || this.substeps > 32) throw new Error("substeps must be an integer from 1 to 32");
    this.ccdEnabled = options.ccdEnabled ?? options.board.physics.ccdEnabled;
    this.rng = new Mulberry32(options.seed);
    this.world = new RAPIER.World({ x: 0, y: this.board.gravity });
    this.world.lengthUnit = this.board.ball.radius * 2;
    this.world.timestep = this.fixedDt / this.substeps;
    this.startSensors = this.board.sensors.filter((sensor) => sensor.role === "START");
    const cellSizeMillimeters = options.heatmapCellSizeMillimeters;
    this.heatmap = cellSizeMillimeters === undefined ? null : this.createHeatmap(cellSizeMillimeters);
    this.createBoardColliders();
  }

  static async create(options: EngineOptions): Promise<PachinkoPhysicsEngine> {
    await initializeRapier();
    return new PachinkoPhysicsEngine(options);
  }

  get tick(): number { return this.tickValue; }
  get simulationTime(): number { return this.tickValue * this.fixedDt; }
  get completedBalls(): readonly CompletedBall[] { return this.completed; }

  setCcdEnabled(enabled: boolean): void {
    this.ccdEnabled = enabled;
    for (const ball of this.balls.values()) ball.body.enableCcd(enabled);
  }

  schedule(command: InputCommand): void {
    if (command.tick < this.tickValue) throw new Error("Cannot schedule an input in the past");
    if (command.power < 0 || command.power > 1) throw new Error("Launch power must be between 0 and 1");
    const previous = this.commands.at(-1);
    this.commands.push(command);
    if (previous !== undefined && (previous.tick > command.tick || (previous.tick === command.tick && previous.sequence > command.sequence))) {
      this.commands.sort((a, b) => a.tick - b.tick || a.sequence - b.sequence);
    }
    this.inputLog.push(command);
  }

  launch(power: number): string {
    const id = `ball-${this.nextBallId++}`;
    const position = this.board.launcher.position;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y)
        .setLinearDamping(this.board.physics.linearDamping)
        .setAngularDamping(this.board.physics.angularDamping)
        .setCcdEnabled(this.ccdEnabled),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(this.board.ball.radius)
        .setMassProperties(this.board.ball.mass, { x: 0, y: 0 }, 2 / 5 * this.board.ball.mass * this.board.ball.radius ** 2)
        .setFriction(this.board.ball.friction)
        .setRestitution(this.board.ball.restitution)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    const record: BallRecord = {
      id, body, collider, previousPosition: { ...position }, state: "SPAWNED",
      spawnTime: this.simulationTime, collisionCount: 0, nailCollisionCount: 0, railCollisionCount: 0,
      windmillCollisionCount: 0, otherSensorCount: 0, velocitySampleCount: 0, velocitySum: 0,
      maxVelocity: 0, velocityClampCount: 0,
      collisionVelocity: { samples: 0, speedBeforeSum: 0, speedAfterSum: 0, maxSpeedBefore: 0, maxSpeedAfter: 0 },
      lastHeatmapCell: null, lastWarpTick: -Infinity,
      ...(this.heatmap !== null ? { trajectory: new Map<number, MutableTrajectoryCell>() } : {}),
      ...(this.options.collectTrajectories === true ? { trajectorySamples: [] } : {}),
      route: null, routeSequence: [], sensorEnterCounts: {},
    };
    this.balls.set(id, record);
    this.colliderToBall.set(collider.handle, id);
    this.emit({ type: "ball.spawned", ballId: id, simulationTime: this.simulationTime, tick: this.tickValue });

    const velocityMagnitude = this.board.launcher.minVelocity +
      (this.board.launcher.maxVelocity - this.board.launcher.minVelocity) * power;
    const jitter = (this.rng.next() * 2 - 1) * this.board.launcher.angleJitterRadians;
    const angle = this.board.launcher.angleRadians + jitter;
    const velocity = { x: Math.cos(angle) * velocityMagnitude, y: Math.sin(angle) * velocityMagnitude };
    body.setLinvel(velocity, true);
    record.velocitySampleCount = 1;
    record.velocitySum = velocityMagnitude;
    record.maxVelocity = velocityMagnitude;
    this.velocitySampleCount += 1;
    this.velocitySum += velocityMagnitude;
    this.maxObservedVelocity = Math.max(this.maxObservedVelocity, velocityMagnitude);
    record.trajectorySamples?.push({
      tick: this.tickValue,
      simulationTime: this.simulationTime,
      position: { ...position },
      velocity,
    });
    record.state = "LAUNCHING";
    this.emit({ type: "ball.launched", ballId: id, simulationTime: this.simulationTime, tick: this.tickValue, velocity });
    return id;
  }

  step(): void {
    const startedAt = performance.now();
    this.consumeCommands();
    for (const ball of this.balls.values()) {
      const position = ball.body.translation();
      ball.previousPosition = { x: position.x, y: position.y };
    }
    const substepDt = this.fixedDt / this.substeps;
    for (let substep = 0; substep < this.substeps; substep += 1) {
      const substepTime = this.simulationTime + substep * substepDt;
      for (const mechanism of this.movingMechanisms) {
        if (!mechanism.driven) continue;
        const rotation = mechanism.motion === "OSCILLATE"
          ? mechanism.baseRotation + mechanism.amplitude * Math.sin(Math.PI * 2 * mechanism.frequency * substepTime + mechanism.phase)
          : mechanism.body.rotation() + mechanism.angularVelocity * substepDt;
        mechanism.body.setNextKinematicRotation(rotation);
      }
      const velocityBefore = new Map<string, { readonly x: number; readonly y: number }>();
      const positionBefore = new Map<string, { readonly x: number; readonly y: number }>();
      for (const ball of this.balls.values()) {
        if (ball.terminal !== undefined) continue;
        const velocity = ball.body.linvel();
        const position = ball.body.translation();
        velocityBefore.set(ball.id, { x: velocity.x, y: velocity.y });
        positionBefore.set(ball.id, { x: position.x, y: position.y });
        const upwardGateFilter = velocity.y < 0 ? 0x0002 : 0;
        ball.collider.setCollisionGroups((0x0001 << 16) | 0x0001 | upwardGateFilter);
      }
      this.world.step(this.eventQueue);
      this.sampleVelocities();
      this.sampleHeatmap(positionBefore);
      this.captureStartCrossings(positionBefore);
      this.drainCollisionEvents(velocityBefore);
      this.clampVelocities();
    }
    while (this.recentContacts[0] !== undefined && this.recentContacts[0].expiresAtTick <= this.tickValue) this.recentContacts.shift();
    this.sampleTrajectories();
    this.updateBalls();
    this.tickValue += 1;
    this.lastStepDurationMs = performance.now() - startedAt;
  }

  snapshot(): SimulationSnapshot {
    return {
      tick: this.tickValue,
      simulationTime: this.simulationTime,
      balls: [...this.balls.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })).map((ball) => this.ballSnapshot(ball)),
      contacts: this.recentContacts.map((contact) => ({
        ballId: contact.ballId,
        colliderId: contact.colliderId,
        point: contact.point,
        normal: contact.normal,
        tick: contact.tick,
      })),
      mechanisms: this.movingMechanisms.map((mechanism) => {
        const position = mechanism.body.translation();
        const bodyRotation = mechanism.body.rotation();
        const cos = Math.cos(bodyRotation);
        const sin = Math.sin(bodyRotation);
        const center = {
          x: position.x + mechanism.localCenter.x * cos - mechanism.localCenter.y * sin,
          y: position.y + mechanism.localCenter.x * sin + mechanism.localCenter.y * cos,
        };
        const rotation = bodyRotation + mechanism.localRotation;
        const dx = Math.sin(rotation) * mechanism.length / 2;
        const dy = -Math.cos(rotation) * mechanism.length / 2;
        return {
          mechanismId: mechanism.mechanismId,
          colliderId: mechanism.colliderId,
          from: { x: center.x - dx, y: center.y - dy },
          to: { x: center.x + dx, y: center.y + dy },
          thickness: mechanism.thickness,
          rotation,
        };
      }),
    };
  }

  diagnostics(): PhysicsDiagnostics {
    let finite = true;
    for (const ball of this.balls.values()) {
      const p = ball.body.translation();
      const v = ball.body.linvel();
      finite &&= Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(ball.body.angvel());
    }
    let dynamicBodyCount = 0;
    for (const ball of this.balls.values()) if (ball.body.isDynamic()) dynamicBodyCount += 1;
    return {
      dynamicBodyCount, activeBallCount: this.balls.size, lastStepDurationMs: this.lastStepDurationMs, finite,
      velocityClampCount: this.velocityClampCount,
      maxObservedVelocity: this.maxObservedVelocity,
      averageVelocity: this.velocitySampleCount === 0 ? 0 : this.velocitySum / this.velocitySampleCount,
    };
  }

  heatmapResult(): HeatmapResult | null {
    const heatmap = this.heatmap;
    if (heatmap === null) return null;
    const cellSizeMillimeters = heatmap.cellSizeMeters * 1000;
    const cellsFrom = (arrays: HeatmapArrays) => Array.from({ length: heatmap.columns * heatmap.rows }, (_, index) => {
      const column = index % heatmap.columns;
      const row = Math.floor(index / heatmap.columns);
      const velocitySamples = arrays.velocitySamples[index] ?? 0;
      return {
        column,
        row,
        xMillimeters: column * cellSizeMillimeters,
        yMillimeters: row * cellSizeMillimeters,
        widthMillimeters: Math.min(cellSizeMillimeters, this.board.width * 1000 - column * cellSizeMillimeters),
        heightMillimeters: Math.min(cellSizeMillimeters, this.board.height * 1000 - row * cellSizeMillimeters),
        ballPassages: arrays.passages[index] ?? 0,
        collisions: arrays.collisions[index] ?? 0,
        velocitySamples,
        averageVelocity: velocitySamples === 0 ? 0 : (arrays.velocitySums[index] ?? 0) / velocitySamples,
      };
    });
    return {
      cellSizeMillimeters, columns: heatmap.columns, rows: heatmap.rows,
      cells: cellsFrom(heatmap),
      outcomes: (["start", "out", "otherPocket", "timeout"] as const).map((terminal) => ({ terminal, cells: cellsFrom(heatmap.outcomes[terminal]) })),
    };
  }

  replayLog(): ReplayLog {
    const inputSequence = [...this.inputLog].sort((a, b) => a.tick - b.tick || a.sequence - b.sequence);
    return { boardVersion: this.options.board.version, physicsVersion: PHYSICS_VERSION, seed: this.options.seed, inputSequence };
  }

  dispose(): void {
    this.world.free();
    this.eventQueue.free();
    this.balls.clear();
    this.colliderToBall.clear();
  }

  private createBoardColliders(): void {
    for (const nail of this.board.nails) {
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(nail.xMeters, nail.yMeters));
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.ball(nail.radiusMeters).setFriction(nail.friction).setRestitution(nail.restitution)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body,
      );
      this.staticColliders.set(collider.handle, { id: nail.id, kind: "nail", metricKind: "nail" });
    }
    for (const rail of this.board.rails) {
      const collider = segmentBody(this.world, rail, true);
      this.staticColliders.set(collider.handle, { id: rail.id, kind: "rail", metricKind: "rail" });
    }
    for (const arc of this.board.arcRails) {
      const collider = arcRailBody(this.world, arc);
      this.staticColliders.set(collider.handle, { id: arc.id, kind: "rail", metricKind: "rail" });
    }
    for (const wall of this.board.walls) {
      const collider = segmentBody(this.world, wall, true);
      this.staticColliders.set(collider.handle, { id: wall.id, kind: "wall", metricKind: "other" });
    }
    for (const gate of this.board.gates.filter((value) => value.enabled)) {
      const collider = segmentBody(this.world, gate, true, true);
      if (gate.collisionMode === "UPWARD_ONLY") {
        collider.setCollisionGroups((0x0002 << 16) | 0x0001);
      }
      this.staticColliders.set(collider.handle, { id: gate.id, kind: "gate", metricKind: "rail" });
    }
    for (const sensor of this.board.sensors) {
      // START is a physical mouth, not an overlap target. Capture it only when
      // the ball centre crosses with enough horizontal clearance.
      if (sensor.role === "START") continue;
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(sensor.centerMeters.x, sensor.centerMeters.y));
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(sensor.widthMeters / 2, sensor.heightMeters / 2)
          .setSensor(true).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body,
      );
      this.staticColliders.set(collider.handle, {
        id: sensor.id, kind: "sensor", role: sensor.role, metricKind: "other",
        ...(sensor.warpMeters === undefined ? {} : { warp: sensor.warpMeters }),
      });
    }
    for (const mechanism of this.board.mechanisms) {
      if (mechanism.adapter === "fixed-outline-v1" && mechanism.colliders.every((definition) => definition.bodyType === "FIXED")) {
        const collider = fixedOutlineBody(this.world, mechanism.id, mechanism.colliders);
        this.staticColliders.set(collider.handle, { id: `${mechanism.id}/outline`, kind: "mechanism", metricKind: "other" });
        continue;
      }
      if (mechanism.colliders.every((definition) => definition.bodyType === "DYNAMIC")) {
        const pivot = mechanism.pivotMeters;
        if (pivot === undefined) throw new Error(`Dynamic mechanism requires a pivot: ${mechanism.id}`);
        const body = this.world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(pivot.x, pivot.y)
            .setAngvel(mechanism.angularVelocityRadiansPerSecond)
            .setAngularDamping(mechanism.angularDamping)
            .lockTranslations(),
        );
        for (const definition of mechanism.colliders) {
          const dx = definition.to.x - definition.from.x;
          const dy = definition.to.y - definition.from.y;
          const length = Math.hypot(dx, dy);
          const center = { x: (definition.from.x + definition.to.x) / 2 - pivot.x, y: (definition.from.y + definition.to.y) / 2 - pivot.y };
          const rotation = Math.atan2(dy, dx) + Math.PI / 2;
          const collider = this.world.createCollider(
            RAPIER.ColliderDesc.capsule(length / 2, definition.thickness / 2)
              .setTranslation(center.x, center.y)
              .setRotation(rotation)
              .setMass(mechanism.mass / mechanism.colliders.length)
              .setFriction(definition.friction)
              .setRestitution(definition.restitution)
              .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
            body,
          );
          const colliderId = `${mechanism.id}/${definition.id}`;
          this.staticColliders.set(collider.handle, { id: colliderId, kind: "mechanism", metricKind: mechanism.adapter.includes("windmill") ? "windmill" : "other" });
          this.movingMechanisms.push({
            mechanismId: mechanism.id, colliderId, body, driven: false, localCenter: center, localRotation: rotation,
            motion: mechanism.motion, baseRotation: 0, angularVelocity: 0, amplitude: 0, frequency: 0, phase: 0,
            length, thickness: definition.thickness,
          });
        }
        continue;
      }
      for (const definition of mechanism.colliders) {
        const collider = segmentBody(this.world, definition, true, definition.bodyType === "KINEMATIC");
        const colliderId = `${mechanism.id}/${definition.id}`;
        const metricKind = mechanism.adapter.includes("windmill") ? "windmill" as const : "other" as const;
        this.staticColliders.set(collider.handle, { id: colliderId, kind: "mechanism", metricKind });
        const body = collider.parent();
        const moves = mechanism.motion === "OSCILLATE" ? mechanism.oscillationAmplitudeRadians !== 0 && mechanism.oscillationFrequencyHz !== 0 : mechanism.angularVelocityRadiansPerSecond !== 0;
        if (body !== null && definition.bodyType === "KINEMATIC" && moves) {
          this.movingMechanisms.push({
            mechanismId: mechanism.id, colliderId, body, driven: true, localCenter: { x: 0, y: 0 }, localRotation: 0,
            motion: mechanism.motion, baseRotation: body.rotation(),
            angularVelocity: mechanism.angularVelocityRadiansPerSecond, amplitude: mechanism.oscillationAmplitudeRadians,
            frequency: mechanism.oscillationFrequencyHz, phase: mechanism.phaseRadians,
            length: Math.hypot(definition.to.x - definition.from.x, definition.to.y - definition.from.y),
            thickness: definition.thickness,
          });
        }
      }
    }
  }

  private consumeCommands(): void {
    while (this.commands[0]?.tick === this.tickValue) {
      const command = this.commands.shift();
      if (command?.type === "launch") this.launch(command.power);
    }
  }

  private drainCollisionEvents(velocityBefore: ReadonlyMap<string, { readonly x: number; readonly y: number }>): void {
    this.eventQueue.drainCollisionEvents((first, second, started) => {
      const firstBallId = this.colliderToBall.get(first);
      const secondBallId = this.colliderToBall.get(second);
      if (firstBallId !== undefined && secondBallId !== undefined) {
        if (!started) return;
        const ordered = [firstBallId, secondBallId].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        for (const [ballId, otherBallId] of [[ordered[0], ordered[1]], [ordered[1], ordered[0]]] as const) {
          if (ballId === undefined || otherBallId === undefined) continue;
          const ball = this.balls.get(ballId);
          if (ball === undefined || ball.terminal !== undefined) continue;
          this.recordCollision(ball, "other", velocityBefore.get(ballId));
          this.emit({ type: "ball.collision", ballId, colliderId: otherBallId, simulationTime: this.simulationTime, tick: this.tickValue });
        }
        return;
      }
      const ballId = firstBallId ?? secondBallId;
      const staticHandle = this.colliderToBall.has(first) ? second : first;
      if (ballId === undefined) return;
      const ball = this.balls.get(ballId);
      const meta = this.staticColliders.get(staticHandle);
      if (ball === undefined || meta === undefined || ball.terminal !== undefined) return;
      if (!started) {
        if (meta.kind === "sensor") this.emit({ type: "sensor.exit", ballId, sensorId: meta.id, role: meta.role ?? "", simulationTime: this.simulationTime, tick: this.tickValue });
        return;
      }
      if (meta.kind === "sensor") {
        this.handleSensorEnter(ball, meta);
      } else {
        this.captureContact(ball, staticHandle, meta.id);
        const speedBefore = this.recordCollision(ball, meta.metricKind, velocityBefore.get(ballId));
        this.emit({ type: "ball.collision", ballId, colliderId: meta.id, simulationTime: this.simulationTime, tick: this.tickValue });
        if (meta.kind === "nail") this.emit({ type: "nail.hit", ballId, nailId: meta.id, speedBefore, simulationTime: this.simulationTime, tick: this.tickValue });
      }
    });
  }

  private recordCollision(ball: BallRecord, kind: StaticColliderMeta["metricKind"], before?: { readonly x: number; readonly y: number }): number {
    ball.collisionCount += 1;
    if (kind === "nail") ball.nailCollisionCount += 1;
    else if (kind === "rail") ball.railCollisionCount += 1;
    else if (kind === "windmill") ball.windmillCollisionCount += 1;
    const beforeSpeed = before === undefined ? 0 : Math.hypot(before.x, before.y);
    const afterVelocity = ball.body.linvel();
    const afterSpeed = Math.hypot(afterVelocity.x, afterVelocity.y);
    const current = ball.collisionVelocity;
    ball.collisionVelocity = {
      samples: current.samples + 1,
      speedBeforeSum: current.speedBeforeSum + beforeSpeed,
      speedAfterSum: current.speedAfterSum + afterSpeed,
      maxSpeedBefore: Math.max(current.maxSpeedBefore, beforeSpeed),
      maxSpeedAfter: Math.max(current.maxSpeedAfter, afterSpeed),
    };
    this.recordHeatmapCollision(ball);
    return beforeSpeed;
  }

  private captureContact(ball: BallRecord, staticHandle: number, colliderId: string): void {
    const other = this.world.getCollider(staticHandle);
    let captured = false;
    this.world.contactPair(ball.collider, other, (manifold, flipped) => {
      if (captured || manifold.numSolverContacts() === 0) return;
      const point = manifold.solverContactPoint(0);
      const rawNormal = manifold.normal();
      const sign = flipped ? -1 : 1;
      this.recentContacts.push({
        ballId: ball.id,
        colliderId,
        point: { x: point.x, y: point.y },
        normal: { x: rawNormal.x * sign, y: rawNormal.y * sign },
        tick: this.tickValue,
        expiresAtTick: this.tickValue + Math.max(1, Math.round(this.physicsHz * 0.12)),
      });
      captured = true;
    });
  }

  private handleSensorEnter(ball: BallRecord, meta: StaticColliderMeta): void {
    this.emit({ type: "sensor.enter", ballId: ball.id, sensorId: meta.id, role: meta.role ?? "", simulationTime: this.simulationTime, tick: this.tickValue });
    if (meta.role !== undefined) ball.sensorEnterCounts[meta.role] = (ball.sensorEnterCounts[meta.role] ?? 0) + 1;
    if (meta.role !== "START" && meta.role !== "OUT" && !meta.role?.startsWith("ROUTE_")) ball.otherSensorCount += 1;
    if (meta.role === "WARP") {
      this.emit({ type: "warp.enter", ballId: ball.id, sensorId: meta.id, destinationSensorId: meta.warp?.destinationSensorId ?? null, simulationTime: this.simulationTime, tick: this.tickValue });
      if (meta.warp !== undefined && ball.lastWarpTick !== this.tickValue) {
        const destination = this.board.sensors.find((sensor) => sensor.id === meta.warp?.destinationSensorId);
        if (destination !== undefined) {
          const position = {
            x: destination.centerMeters.x + meta.warp.destinationOffset.x,
            y: destination.centerMeters.y + meta.warp.destinationOffset.y,
          };
          ball.body.setTranslation(position, true);
          if (meta.warp.velocityMode === "RESET") ball.body.setLinvel({ x: 0, y: 0 }, true);
          ball.previousPosition = position;
          ball.lastHeatmapCell = null;
          ball.lastWarpTick = this.tickValue;
        }
      }
    }
    if (meta.role === "ROUTE_LEFT" || meta.role === "ROUTE_CENTER" || meta.role === "ROUTE_RIGHT") {
      const route = meta.role.slice(6).toLowerCase() as Route;
      ball.routeSequence.push(route);
      ball.route ??= route;
    }
    if (ball.terminal !== undefined) return;
    if (meta.role === "START") this.markTerminal(ball, "start", "ENTERED_POCKET");
    else if (meta.role === "POCKET" || meta.role === "ELECTRIC_SUPPORT" || meta.role === "ATTACKER") this.markTerminal(ball, "otherPocket", "ENTERED_POCKET");
    else if (meta.role === "OUT") {
      this.markTerminal(ball, "out", "OUT");
      this.emit({ type: "ball.out", ballId: ball.id, sensorId: meta.id, simulationTime: this.simulationTime, tick: this.tickValue });
    }
  }

  private captureStartCrossings(previousPositions: ReadonlyMap<string, { readonly x: number; readonly y: number }>): void {
    if (this.startSensors.length === 0) return;
    for (const ball of this.balls.values()) {
      if (ball.terminal !== undefined || ball.lastWarpTick === this.tickValue) continue;
      const previous = previousPositions.get(ball.id);
      if (previous === undefined) continue;
      const current = ball.body.translation();
      const deltaY = current.y - previous.y;
      if (deltaY <= 0) continue;
      for (const sensor of this.startSensors) {
        if (previous.y >= sensor.centerMeters.y || current.y < sensor.centerMeters.y) continue;
        const centerClearance = sensor.widthMeters - this.board.ball.radius * 2;
        if (centerClearance < 0) continue;
        const crossing = (sensor.centerMeters.y - previous.y) / deltaY;
        const crossingX = previous.x + (current.x - previous.x) * crossing;
        if (Math.abs(crossingX - sensor.centerMeters.x) > centerClearance / 2 + 1e-9) continue;
        this.emit({ type: "sensor.enter", ballId: ball.id, sensorId: sensor.id, role: sensor.role, simulationTime: this.simulationTime, tick: this.tickValue });
        ball.sensorEnterCounts[sensor.role] = (ball.sensorEnterCounts[sensor.role] ?? 0) + 1;
        this.markTerminal(ball, "start", "ENTERED_POCKET");
        break;
      }
    }
  }

  private markTerminal(ball: BallRecord, terminal: CompletedBall["terminal"], state: BallState): void {
    ball.terminal = terminal;
    ball.terminalTime = this.simulationTime;
    ball.state = state;
    ball.body.setLinvel({ x: 0, y: 0 }, true);
    ball.body.setAngvel(0, true);
    ball.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
    ball.collider.setCollisionGroups(0);
  }

  private createHeatmap(cellSizeMillimeters: number): HeatmapAccumulator {
    if (!Number.isFinite(cellSizeMillimeters) || cellSizeMillimeters <= 0) throw new Error("heatmap cell size must be positive");
    const cellSizeMeters = cellSizeMillimeters / 1000;
    const columns = Math.ceil(this.board.width / cellSizeMeters);
    const rows = Math.ceil(this.board.height / cellSizeMeters);
    if (columns * rows > 1_000_000) throw new Error("heatmap grid is too large");
    return {
      cellSizeMeters, columns, rows,
      passages: new Uint32Array(columns * rows),
      collisions: new Uint32Array(columns * rows),
      velocitySamples: new Uint32Array(columns * rows),
      velocitySums: new Float64Array(columns * rows),
      outcomes: {
        start: this.createHeatmapArrays(columns * rows),
        out: this.createHeatmapArrays(columns * rows),
        otherPocket: this.createHeatmapArrays(columns * rows),
        timeout: this.createHeatmapArrays(columns * rows),
      },
    };
  }

  private createHeatmapArrays(length: number): HeatmapArrays {
    return { passages: new Uint32Array(length), collisions: new Uint32Array(length), velocitySamples: new Uint32Array(length), velocitySums: new Float64Array(length) };
  }

  private commitTrajectoryToOutcome(ball: BallRecord, terminal: CompletedBall["terminal"]): void {
    const heatmap = this.heatmap;
    const trajectory = ball.trajectory;
    if (heatmap === null || trajectory === undefined) return;
    const target = heatmap.outcomes[terminal];
    for (const [index, cell] of trajectory) {
      target.passages[index] = (target.passages[index] ?? 0) + cell.passages;
      target.collisions[index] = (target.collisions[index] ?? 0) + cell.collisions;
      target.velocitySamples[index] = (target.velocitySamples[index] ?? 0) + cell.velocitySamples;
      target.velocitySums[index] = (target.velocitySums[index] ?? 0) + cell.velocitySum;
    }
  }

  private heatmapCellIndex(position: { readonly x: number; readonly y: number }): number | null {
    const heatmap = this.heatmap;
    if (heatmap === null || position.x < 0 || position.y < 0 || position.x >= this.board.width || position.y >= this.board.height) return null;
    const column = Math.floor(position.x / heatmap.cellSizeMeters);
    const row = Math.floor(position.y / heatmap.cellSizeMeters);
    return row * heatmap.columns + column;
  }

  private trajectoryCell(ball: BallRecord, index: number): MutableTrajectoryCell | null {
    const trajectory = ball.trajectory;
    if (trajectory === undefined) return null;
    const cell = trajectory.get(index) ?? { passages: 0, collisions: 0, velocitySamples: 0, velocitySum: 0 };
    trajectory.set(index, cell);
    return cell;
  }

  private heatmapCellsAlongSegment(from: { readonly x: number; readonly y: number }, to: { readonly x: number; readonly y: number }): readonly number[] {
    const heatmap = this.heatmap;
    if (heatmap === null) return [];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    let enter = 0;
    let exit = 1;
    const clip = (p: number, q: number): boolean => {
      if (p === 0) return q >= 0;
      const time = q / p;
      if (p < 0) {
        if (time > exit) return false;
        enter = Math.max(enter, time);
      } else {
        if (time < enter) return false;
        exit = Math.min(exit, time);
      }
      return true;
    };
    if (!clip(-dx, from.x) || !clip(dx, this.board.width - from.x) ||
        !clip(-dy, from.y) || !clip(dy, this.board.height - from.y) || enter > exit) return [];
    const inside = (value: number, maximum: number) => Math.min(Math.max(value, 0), maximum - maximum * Number.EPSILON);
    const start = { x: inside(from.x + dx * enter, this.board.width), y: inside(from.y + dy * enter, this.board.height) };
    const end = { x: inside(from.x + dx * exit, this.board.width), y: inside(from.y + dy * exit, this.board.height) };
    let column = Math.floor(start.x / heatmap.cellSizeMeters);
    let row = Math.floor(start.y / heatmap.cellSizeMeters);
    const endColumn = Math.floor(end.x / heatmap.cellSizeMeters);
    const endRow = Math.floor(end.y / heatmap.cellSizeMeters);
    const cells = [row * heatmap.columns + column];
    const segmentX = end.x - start.x;
    const segmentY = end.y - start.y;
    const stepX = Math.sign(segmentX);
    const stepY = Math.sign(segmentY);
    let nextX = stepX === 0 ? Infinity : ((stepX > 0 ? column + 1 : column) * heatmap.cellSizeMeters - start.x) / segmentX;
    let nextY = stepY === 0 ? Infinity : ((stepY > 0 ? row + 1 : row) * heatmap.cellSizeMeters - start.y) / segmentY;
    const deltaX = stepX === 0 ? Infinity : heatmap.cellSizeMeters / Math.abs(segmentX);
    const deltaY = stepY === 0 ? Infinity : heatmap.cellSizeMeters / Math.abs(segmentY);
    while (column !== endColumn || row !== endRow) {
      if (nextX < nextY) {
        column += stepX;
        nextX += deltaX;
      } else if (nextY < nextX) {
        row += stepY;
        nextY += deltaY;
      } else {
        column += stepX;
        row += stepY;
        nextX += deltaX;
        nextY += deltaY;
      }
      cells.push(row * heatmap.columns + column);
    }
    return cells;
  }

  private sampleHeatmap(previousPositions: ReadonlyMap<string, { readonly x: number; readonly y: number }>): void {
    const heatmap = this.heatmap;
    if (heatmap === null) return;
    for (const ball of this.balls.values()) {
      const previous = previousPositions.get(ball.id);
      if (previous === undefined) continue;
      const position = ball.body.translation();
      for (const index of this.heatmapCellsAlongSegment(previous, position)) {
        if (ball.lastHeatmapCell === index) continue;
        heatmap.passages[index] = (heatmap.passages[index] ?? 0) + 1;
        const trajectory = this.trajectoryCell(ball, index);
        if (trajectory !== null) trajectory.passages += 1;
        ball.lastHeatmapCell = index;
      }
      const index = this.heatmapCellIndex(position);
      if (index === null) { ball.lastHeatmapCell = null; continue; }
      // One equal-duration sample per physics substep: averageVelocity is a time-sampled endpoint mean.
      const velocity = ball.body.linvel();
      const speed = Math.hypot(velocity.x, velocity.y);
      heatmap.velocitySamples[index] = (heatmap.velocitySamples[index] ?? 0) + 1;
      heatmap.velocitySums[index] = (heatmap.velocitySums[index] ?? 0) + speed;
      const trajectory = this.trajectoryCell(ball, index);
      if (trajectory !== null) { trajectory.velocitySamples += 1; trajectory.velocitySum += speed; }
    }
  }

  private sampleTrajectories(): void {
    if (this.options.collectTrajectories !== true) return;
    for (const ball of this.balls.values()) {
      const position = ball.body.translation();
      const velocity = ball.body.linvel();
      ball.trajectorySamples?.push({
        tick: this.tickValue + 1,
        simulationTime: this.simulationTime + this.fixedDt,
        position: { x: position.x, y: position.y },
        velocity: { x: velocity.x, y: velocity.y },
      });
    }
  }

  private recordHeatmapCollision(ball: BallRecord): void {
    const heatmap = this.heatmap;
    if (heatmap === null) return;
    const index = this.heatmapCellIndex(ball.body.translation());
    if (index === null) return;
    heatmap.collisions[index] = (heatmap.collisions[index] ?? 0) + 1;
    const trajectory = this.trajectoryCell(ball, index);
    if (trajectory !== null) trajectory.collisions += 1;
  }

  private sampleVelocities(): void {
    for (const ball of this.balls.values()) {
      if (ball.terminal !== undefined) continue;
      const velocity = ball.body.linvel();
      const speed = Math.hypot(velocity.x, velocity.y);
      ball.velocitySampleCount += 1;
      ball.velocitySum += speed;
      ball.maxVelocity = Math.max(ball.maxVelocity, speed);
      this.velocitySampleCount += 1;
      this.velocitySum += speed;
      this.maxObservedVelocity = Math.max(this.maxObservedVelocity, speed);
    }
  }

  private clampVelocities(): void {
    const limit = this.board.ball.maxVelocity;
    if (limit === null) return;
    for (const ball of this.balls.values()) {
      if (ball.terminal !== undefined) continue;
      const velocity = ball.body.linvel();
      const speed = Math.hypot(velocity.x, velocity.y);
      if (speed <= limit) continue;
      const scale = limit / speed;
      ball.body.setLinvel({ x: velocity.x * scale, y: velocity.y * scale }, true);
      ball.velocityClampCount += 1;
      this.velocityClampCount += 1;
    }
  }

  private updateBalls(): void {
    const destroy: BallRecord[] = [];
    for (const ball of this.balls.values()) {
      const position = ball.body.translation();
      if (ball.state === "LAUNCHING" && position.y < this.board.launcher.position.y - 0.03) ball.state = "PLAYING";
      const escaped = position.y > this.board.height + ball.collider.radius();
      if (ball.terminal === undefined && escaped) {
        this.markTerminal(ball, "out", "OUT");
        this.emit({ type: "ball.out", ballId: ball.id, sensorId: "world-boundary", simulationTime: this.simulationTime, tick: this.tickValue });
      }
      if (ball.terminal === undefined && this.simulationTime - ball.spawnTime >= this.options.board.physics.maxBallLifetimeSeconds) {
        this.markTerminal(ball, "timeout", "OUT");
      }
      if (ball.terminalTime !== undefined && this.simulationTime - ball.terminalTime >= this.options.board.physics.terminalRetentionSeconds) destroy.push(ball);
    }
    for (const ball of destroy) this.destroyBall(ball);
  }

  private destroyBall(ball: BallRecord): void {
    const lifetime = (ball.terminalTime ?? this.simulationTime) - ball.spawnTime;
    const terminal = ball.terminal ?? "timeout";
    const reason = terminal === "timeout" ? "timeout" : "terminal";
    const position = ball.body.translation();
    const [left, right] = this.board.routeBoundariesX;
    const route = ball.route ?? (position.x < left ? "left" : position.x > right ? "right" : "center");
    this.commitTrajectoryToOutcome(ball, terminal);
    const heatmapColumns = this.heatmap?.columns;
    const trajectory: TrajectoryCellSummary[] | undefined = !this.options.collectTrajectories || ball.trajectory === undefined || heatmapColumns === undefined ? undefined : [...ball.trajectory.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, cell]) => ({ column: index % heatmapColumns, row: Math.floor(index / heatmapColumns), ...cell }));
    this.completed.push({
      id: ball.id, lifetime, collisionCount: ball.collisionCount, terminal, route, finalPosition: { x: position.x, y: position.y },
      routeSequence: [...ball.routeSequence], sensorEnterCounts: { ...ball.sensorEnterCounts },
      velocitySampleCount: ball.velocitySampleCount, velocitySum: ball.velocitySum, maxVelocity: ball.maxVelocity,
      velocityClampCount: ball.velocityClampCount, nailCollisionCount: ball.nailCollisionCount,
      railCollisionCount: ball.railCollisionCount, windmillCollisionCount: ball.windmillCollisionCount,
      otherSensorCount: ball.otherSensorCount, collisionVelocity: ball.collisionVelocity,
      ...(trajectory === undefined ? {} : { trajectory }),
      ...(ball.trajectorySamples === undefined ? {} : { trajectorySamples: [...ball.trajectorySamples] }),
    });
    this.colliderToBall.delete(ball.collider.handle);
    this.world.removeRigidBody(ball.body);
    ball.state = "DESTROYED";
    this.balls.delete(ball.id);
    this.emit({ type: "ball.destroyed", ballId: ball.id, simulationTime: this.simulationTime, tick: this.tickValue, reason });
  }

  private ballSnapshot(ball: BallRecord): BallSnapshot {
    const position = ball.body.translation();
    const velocity = ball.body.linvel();
    return {
      id: ball.id, position: { x: position.x, y: position.y }, previousPosition: ball.previousPosition,
      velocity: { x: velocity.x, y: velocity.y }, angularVelocity: ball.body.angvel(),
      radius: this.board.ball.radius, mass: this.board.ball.mass, friction: this.board.ball.friction,
      restitution: this.board.ball.restitution, spawnTime: ball.spawnTime, collisionCount: ball.collisionCount,
      state: ball.state, route: ball.route, routeSequence: [...ball.routeSequence],
    };
  }

  private emit(event: PhysicsEvent): void { this.events.emit(event); }
}
