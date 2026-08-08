import RAPIER from "@dimforge/rapier2d-compat";
import { toSI, type BoardSI, type SegmentMeters } from "@pachinko/board-schema";
import { TypedEventBus, type PhysicsEvent } from "@pachinko/event-system";
import { Mulberry32 } from "./rng.js";
import { PHYSICS_VERSION, type BallSnapshot, type BallState, type CompletedBall, type DebugContact, type EngineOptions, type InputCommand, type PhysicsDiagnostics, type ReplayLog, type SimulationSnapshot } from "./types.js";

interface BallRecord {
  readonly id: string;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  previousPosition: { x: number; y: number };
  state: BallState;
  readonly spawnTime: number;
  collisionCount: number;
  route: "left" | "center" | "right" | null;
  terminal?: CompletedBall["terminal"];
  terminalTime?: number;
}

interface StaticColliderMeta {
  readonly id: string;
  readonly kind: "nail" | "sensor" | "rail" | "wall" | "gate" | "mechanism";
  readonly role?: string;
}

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
  private readonly movingMechanisms: Array<{ readonly body: RAPIER.RigidBody; readonly motion: "ROTATE" | "OSCILLATE"; readonly baseRotation: number; readonly angularVelocity: number; readonly amplitude: number; readonly frequency: number; readonly phase: number }> = [];
  private nextBallId = 1;
  private tickValue = 0;
  private ccdEnabled: boolean;
  private lastStepDurationMs = 0;

  private constructor(private readonly options: EngineOptions) {
    this.board = toSI(options.board);
    this.physicsHz = options.physicsHz ?? options.board.physics.physicsHz;
    this.fixedDt = 1 / this.physicsHz;
    this.ccdEnabled = options.ccdEnabled ?? true;
    this.rng = new Mulberry32(options.seed);
    this.world = new RAPIER.World({ x: 0, y: this.board.gravity });
    this.world.timestep = this.fixedDt;
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
        .setLinearDamping(this.options.board.physics.linearDamping)
        .setAngularDamping(this.options.board.physics.angularDamping)
        .setCcdEnabled(this.ccdEnabled),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(this.board.ball.radius)
        .setMass(this.board.ball.mass)
        .setFriction(this.board.ball.friction)
        .setRestitution(this.board.ball.restitution)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    const record: BallRecord = {
      id, body, collider, previousPosition: { ...position }, state: "SPAWNED",
      spawnTime: this.simulationTime, collisionCount: 0, route: null,
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
    record.state = "LAUNCHING";
    this.emit({ type: "ball.launched", ballId: id, simulationTime: this.simulationTime, tick: this.tickValue, velocity });
    return id;
  }

  step(): void {
    const startedAt = performance.now();
    this.consumeCommands();
    for (const mechanism of this.movingMechanisms) {
      const rotation = mechanism.motion === "OSCILLATE"
        ? mechanism.baseRotation + mechanism.amplitude * Math.sin(Math.PI * 2 * mechanism.frequency * this.simulationTime + mechanism.phase)
        : mechanism.body.rotation() + mechanism.angularVelocity * this.fixedDt;
      mechanism.body.setNextKinematicRotation(rotation);
    }
    for (const ball of this.balls.values()) {
      const upwardGateFilter = ball.body.linvel().y < 0 ? 0x0002 : 0;
      ball.collider.setCollisionGroups((0x0001 << 16) | 0x0001 | upwardGateFilter);
      const position = ball.body.translation();
      ball.previousPosition = { x: position.x, y: position.y };
    }
    this.world.step(this.eventQueue);
    this.drainCollisionEvents();
    while (this.recentContacts[0] !== undefined && this.recentContacts[0].expiresAtTick <= this.tickValue) this.recentContacts.shift();
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
    this.world.forEachRigidBody((body) => { if (body.isDynamic()) dynamicBodyCount += 1; });
    return { dynamicBodyCount, activeBallCount: this.balls.size, lastStepDurationMs: this.lastStepDurationMs, finite };
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
      this.staticColliders.set(collider.handle, { id: nail.id, kind: "nail" });
    }
    for (const rail of this.board.rails) {
      const collider = segmentBody(this.world, rail, true);
      this.staticColliders.set(collider.handle, { id: rail.id, kind: "rail" });
    }
    for (const wall of this.board.walls) {
      const collider = segmentBody(this.world, wall, true);
      this.staticColliders.set(collider.handle, { id: wall.id, kind: "wall" });
    }
    for (const gate of this.board.gates.filter((value) => value.enabled)) {
      const collider = segmentBody(this.world, gate, true, true);
      if (gate.collisionMode === "UPWARD_ONLY") {
        collider.setCollisionGroups((0x0002 << 16) | 0x0001);
      }
      this.staticColliders.set(collider.handle, { id: gate.id, kind: "gate" });
    }
    for (const sensor of this.board.sensors) {
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(sensor.centerMeters.x, sensor.centerMeters.y));
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(sensor.widthMeters / 2, sensor.heightMeters / 2)
          .setSensor(true).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body,
      );
      this.staticColliders.set(collider.handle, { id: sensor.id, kind: "sensor", role: sensor.role });
    }
    for (const mechanism of this.board.mechanisms) {
      for (const definition of mechanism.colliders) {
        const collider = segmentBody(this.world, definition, true, definition.bodyType === "KINEMATIC");
        this.staticColliders.set(collider.handle, { id: `${mechanism.id}/${definition.id}`, kind: "mechanism" });
        const body = collider.parent();
        const moves = mechanism.motion === "OSCILLATE" ? mechanism.oscillationAmplitudeRadians !== 0 && mechanism.oscillationFrequencyHz !== 0 : mechanism.angularVelocityRadiansPerSecond !== 0;
        if (body !== null && definition.bodyType === "KINEMATIC" && moves) {
          this.movingMechanisms.push({ body, motion: mechanism.motion, baseRotation: body.rotation(), angularVelocity: mechanism.angularVelocityRadiansPerSecond, amplitude: mechanism.oscillationAmplitudeRadians, frequency: mechanism.oscillationFrequencyHz, phase: mechanism.phaseRadians });
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

  private drainCollisionEvents(): void {
    this.eventQueue.drainCollisionEvents((first, second, started) => {
      const firstBallId = this.colliderToBall.get(first);
      const secondBallId = this.colliderToBall.get(second);
      if (firstBallId !== undefined && secondBallId !== undefined) {
        if (!started) return;
        const ordered = [firstBallId, secondBallId].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        for (const [ballId, otherBallId] of [[ordered[0], ordered[1]], [ordered[1], ordered[0]]] as const) {
          if (ballId === undefined || otherBallId === undefined) continue;
          const ball = this.balls.get(ballId);
          if (ball === undefined) continue;
          ball.collisionCount += 1;
          this.emit({ type: "ball.collision", ballId, colliderId: otherBallId, simulationTime: this.simulationTime, tick: this.tickValue });
        }
        return;
      }
      const ballId = firstBallId ?? secondBallId;
      const staticHandle = this.colliderToBall.has(first) ? second : first;
      if (ballId === undefined) return;
      const ball = this.balls.get(ballId);
      const meta = this.staticColliders.get(staticHandle);
      if (ball === undefined || meta === undefined) return;
      if (!started) {
        if (meta.kind === "sensor") this.emit({ type: "sensor.exit", ballId, sensorId: meta.id, role: meta.role ?? "", simulationTime: this.simulationTime, tick: this.tickValue });
        return;
      }
      if (meta.kind === "sensor") {
        this.handleSensorEnter(ball, meta);
      } else {
        this.captureContact(ball, staticHandle, meta.id);
        ball.collisionCount += 1;
        this.emit({ type: "ball.collision", ballId, colliderId: meta.id, simulationTime: this.simulationTime, tick: this.tickValue });
        if (meta.kind === "nail") this.emit({ type: "nail.hit", ballId, nailId: meta.id, simulationTime: this.simulationTime, tick: this.tickValue });
      }
    });
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
    if (meta.role === "ROUTE_LEFT" || meta.role === "ROUTE_CENTER" || meta.role === "ROUTE_RIGHT") {
      ball.route ??= meta.role.slice(6).toLowerCase() as "left" | "center" | "right";
    }
    if (ball.terminal !== undefined) return;
    if (meta.role === "START") this.markTerminal(ball, "start", "ENTERED_POCKET");
    else if (meta.role === "POCKET" || meta.role === "ELECTRIC_SUPPORT" || meta.role === "ATTACKER") this.markTerminal(ball, "otherPocket", "ENTERED_POCKET");
    else if (meta.role === "OUT") {
      this.markTerminal(ball, "out", "OUT");
      this.emit({ type: "ball.out", ballId: ball.id, sensorId: meta.id, simulationTime: this.simulationTime, tick: this.tickValue });
    }
  }

  private markTerminal(ball: BallRecord, terminal: CompletedBall["terminal"], state: BallState): void {
    ball.terminal = terminal;
    ball.terminalTime = this.simulationTime;
    ball.state = state;
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
        if (position.y < 0.025) {
          this.markTerminal(ball, "out", "OUT");
          this.emit({ type: "ball.out", ballId: ball.id, sensorId: "upper-world-boundary", simulationTime: this.simulationTime, tick: this.tickValue });
        } else {
          ball.terminal = "timeout";
          ball.terminalTime = this.simulationTime;
          ball.state = "OUT";
        }
      }
      if (ball.terminalTime !== undefined && this.simulationTime - ball.terminalTime >= this.options.board.physics.terminalRetentionSeconds) destroy.push(ball);
    }
    for (const ball of destroy) this.destroyBall(ball);
  }

  private destroyBall(ball: BallRecord): void {
    const lifetime = this.simulationTime - ball.spawnTime;
    const terminal = ball.terminal ?? "timeout";
    const reason = terminal === "timeout" ? "timeout" : "terminal";
    const position = ball.body.translation();
    const [left, right] = this.board.routeBoundariesX;
    const route = ball.route ?? (position.x < left ? "left" : position.x > right ? "right" : "center");
    this.completed.push({ id: ball.id, lifetime, collisionCount: ball.collisionCount, terminal, route, finalPosition: { x: position.x, y: position.y } });
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
      state: ball.state, route: ball.route,
    };
  }

  private emit(event: PhysicsEvent): void { this.events.emit(event); }
}
