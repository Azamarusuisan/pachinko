import { Application, Container, Graphics, Text } from "pixi.js";
import { createBoardRenderTransform, physicsToWorldMm, type BoardDefinition } from "@pachinko/board-schema";
import type { SimulationSnapshot } from "@pachinko/physics-core";

export const pixiArcRunsAnticlockwise = (startAngleDegrees: number, endAngleDegrees: number): boolean => endAngleDegrees < startAngleDegrees;

const mechanismMoves = (mechanism: BoardDefinition["mechanisms"][number], bodyType: "FIXED" | "KINEMATIC" | "DYNAMIC"): boolean => {
  if (bodyType === "DYNAMIC") return true;
  if (bodyType === "FIXED") return false;
  return mechanism.motion === "OSCILLATE"
    ? mechanism.oscillationAmplitudeDegrees !== 0 && mechanism.oscillationFrequencyHz !== 0
    : mechanism.angularVelocityDegreesPerSecond !== 0;
};

/** Normal-play geometry comes only from enabled physical Board definitions. */
export function createBoardVisualGeometry(board: BoardDefinition) {
  return {
    nails: board.nails.filter((nail) => nail.enabled),
    rails: board.rails,
    arcRails: board.arcRails,
    gates: board.gates.filter((gate) => gate.enabled),
    mechanismColliders: board.mechanisms.filter((mechanism) => mechanism.enabled).flatMap((mechanism) => mechanism.colliders
      .filter((collider) => !mechanismMoves(mechanism, collider.bodyType))
      .map((collider) => ({ mechanismId: mechanism.id, ...collider }))),
  };
}

export interface DebugDrawOptions {
  readonly colliders: boolean;
  readonly sensors: boolean;
  readonly velocityVectors: boolean;
  readonly angularVelocity: boolean;
  readonly collisionNormals: boolean;
  readonly collisionPoints: boolean;
  readonly ballTrails: boolean;
  readonly ballIds: boolean;
  readonly nailIds: boolean;
}

export const DEFAULT_DEBUG_DRAW: DebugDrawOptions = {
  colliders: false, sensors: false, velocityVectors: false, angularVelocity: false,
  collisionNormals: false, collisionPoints: false, ballTrails: false, ballIds: false, nailIds: false,
};

export class PixiBoardRenderer {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly staticLayer = new Graphics();
  private readonly staticDebugLayer = new Graphics();
  private readonly labelLayer = new Container();
  private readonly dynamicLayer = new Graphics();
  private readonly dynamicDebugLayer = new Graphics();
  private readonly dynamicLabelLayer = new Container();
  private readonly trails = new Map<string, Array<{ x: number; y: number }>>();
  private resizeObserver: ResizeObserver | null = null;
  private currentDebug: DebugDrawOptions = DEFAULT_DEBUG_DRAW;

  constructor(private readonly board: BoardDefinition) {}

  async mount(host: HTMLElement, debug: DebugDrawOptions): Promise<void> {
    await this.app.init({ backgroundAlpha: 0, antialias: true, resizeTo: host, resolution: window.devicePixelRatio, autoDensity: true });
    host.replaceChildren(this.app.canvas);
    this.app.stage.addChild(this.world);
    this.world.addChild(this.staticLayer, this.dynamicLayer, this.staticDebugLayer, this.dynamicDebugLayer, this.labelLayer, this.dynamicLabelLayer);
    this.currentDebug = debug;
    this.resizeObserver = new ResizeObserver(() => { this.layout(); this.drawStatic(this.currentDebug); });
    this.resizeObserver.observe(host);
    this.layout();
    this.drawStatic(debug);
  }

  render(snapshot: SimulationSnapshot, alpha: number, debug: DebugDrawOptions): void {
    this.dynamicLayer.clear();
    this.dynamicDebugLayer.clear();
    this.dynamicLabelLayer.removeChildren().forEach((child) => child.destroy());
    for (const mechanism of snapshot.mechanisms) {
      const from = physicsToWorldMm(mechanism.from);
      const to = physicsToWorldMm(mechanism.to);
      this.dynamicLayer.moveTo(from.x, from.y).lineTo(to.x, to.y)
        .stroke({ color: 0xb8c2c7, width: mechanism.thickness * 1000, alpha: 0.9 });
      if (debug.colliders) {
        this.dynamicDebugLayer.moveTo(from.x, from.y).lineTo(to.x, to.y)
          .stroke({ color: 0xfbbf24, width: mechanism.thickness * 1000, alpha: 0.8 });
      }
    }
    for (const ball of snapshot.balls) {
      const xMeters = ball.previousPosition.x + (ball.position.x - ball.previousPosition.x) * alpha;
      const yMeters = ball.previousPosition.y + (ball.position.y - ball.previousPosition.y) * alpha;
      const { x, y } = physicsToWorldMm({ x: xMeters, y: yMeters });
      if (debug.ballTrails) {
        const trail = this.trails.get(ball.id) ?? [];
        trail.push({ x, y });
        if (trail.length > 28) trail.shift();
        this.trails.set(ball.id, trail);
        if (trail.length > 1) {
          this.dynamicDebugLayer.moveTo(trail[0]?.x ?? x, trail[0]?.y ?? y);
          for (const point of trail.slice(1)) this.dynamicDebugLayer.lineTo(point.x, point.y);
          this.dynamicDebugLayer.stroke({ color: 0x5bc0eb, width: 0.8, alpha: 0.32 });
        }
      }
      this.dynamicLayer.circle(x, y, ball.radius * 1000)
        .fill({ color: 0xe9f2f5 }).stroke({ color: 0x8fd3ee, width: 0.8 });
      if (debug.colliders) {
        this.dynamicDebugLayer.circle(x, y, ball.radius * 1000)
          .fill({ color: 0x22d3ee, alpha: 0.12 }).stroke({ color: 0x22d3ee, width: 0.7, alpha: 0.9 });
      }
      if (debug.velocityVectors) {
        this.dynamicDebugLayer.moveTo(x, y).lineTo(x + ball.velocity.x * 18, y + ball.velocity.y * 18)
          .stroke({ color: 0xffd166, width: 1.2 });
      }
      if (debug.angularVelocity) {
        this.dynamicDebugLayer.arc(x, y, 8, 0, Math.min(Math.PI * 2, Math.abs(ball.angularVelocity) * 0.15))
          .stroke({ color: 0xf78c6b, width: 1 });
      }
      if (debug.ballIds) {
        const label = new Text({ text: ball.id, style: { fill: 0xffffff, fontSize: 7 } });
        label.position.set(x + 7, y - 7);
        this.dynamicLabelLayer.addChild(label);
      }
    }
    for (const contact of snapshot.contacts) {
      const { x, y } = physicsToWorldMm(contact.point);
      if (debug.collisionPoints) {
        this.dynamicDebugLayer.circle(x, y, 2.2).fill({ color: 0xff5d8f, alpha: 0.95 });
      }
      if (debug.collisionNormals) {
        this.dynamicDebugLayer.moveTo(x, y).lineTo(x + contact.normal.x * 18, y + contact.normal.y * 18)
          .stroke({ color: 0xff5d8f, width: 1.2 });
      }
    }
    const active = new Set(snapshot.balls.map((ball) => ball.id));
    for (const id of this.trails.keys()) if (!active.has(id)) this.trails.delete(id);
    if (debug !== this.currentDebug) {
      this.currentDebug = debug;
      this.drawStatic(debug);
    }
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.app.destroy(true, { children: true });
  }

  private layout(): void {
    const transform = createBoardRenderTransform(this.board.board, this.app.screen);
    this.world.scale.set(transform.scalePixelsPerMillimeter);
    this.world.position.set(transform.originPixels.x, transform.originPixels.y);
  }

  private drawStatic(debug: DebugDrawOptions): void {
    this.staticLayer.clear();
    this.staticDebugLayer.clear();
    this.labelLayer.removeChildren().forEach((child) => child.destroy());
    const visual = createBoardVisualGeometry(this.board);
    for (const rail of visual.rails) {
      this.staticLayer.moveTo(rail.from.x, rail.from.y).lineTo(rail.to.x, rail.to.y)
        .stroke({ color: 0xb8c2c7, width: rail.thickness, alpha: 0.82 });
    }
    for (const arc of visual.arcRails) {
      this.staticLayer.arc(arc.center.x, arc.center.y, arc.radius, arc.startAngleDegrees * Math.PI / 180, arc.endAngleDegrees * Math.PI / 180, pixiArcRunsAnticlockwise(arc.startAngleDegrees, arc.endAngleDegrees))
        .stroke({ color: 0xb8c2c7, width: arc.thickness, alpha: 0.82 });
    }
    for (const gate of visual.gates) {
      this.staticLayer.moveTo(gate.from.x, gate.from.y).lineTo(gate.to.x, gate.to.y)
        .stroke({ color: 0xc9b56e, width: gate.thickness, alpha: 0.9 });
    }
    for (const collider of visual.mechanismColliders) {
      this.staticLayer.moveTo(collider.from.x, collider.from.y).lineTo(collider.to.x, collider.to.y)
        .stroke({ color: 0x9eacb2, width: collider.thickness, alpha: 0.88 });
    }
    // The visual cabinet image is decorative. Draw the authoritative physics gauge
    // over it so every visible foreground nail is also a real collider.
    for (const nail of visual.nails) {
      // The collider is the narrow shaft. The slightly oversized 4.4 mm cap stays
      // legible at the simulator's 430 px cabinet width without changing physics.
      this.staticLayer.circle(nail.positionX, nail.positionY, 2.2)
        .fill({ color: 0x1a2227 }).stroke({ color: 0x06090b, width: 0.25, alpha: 0.96 });
      this.staticLayer.circle(nail.positionX, nail.positionY, 1.84)
        .fill({ color: 0xb8c3c8 }).stroke({ color: 0xf3f6f7, width: 0.22, alpha: 0.92 });
      this.staticLayer.circle(nail.positionX, nail.positionY, 1.42)
        .fill({ color: 0xe1e7e9, alpha: 0.98 });
      this.staticLayer.roundRect(nail.positionX + 0.3, nail.positionY - 1.05, 0.58, 1.9, 0.29)
        .fill({ color: 0x344047, alpha: 0.32 });
      this.staticLayer.roundRect(nail.positionX - 0.78, nail.positionY - 1.28, 0.62, 2, 0.31)
        .fill({ color: 0xffffff, alpha: 0.9 });
    }
    if (debug.colliders) {
      for (const rail of visual.rails) {
        this.staticDebugLayer.moveTo(rail.from.x, rail.from.y).lineTo(rail.to.x, rail.to.y)
          .stroke({ color: 0x38bdf8, width: rail.thickness, alpha: 0.8 });
      }
      for (const arc of visual.arcRails) {
        this.staticDebugLayer.arc(arc.center.x, arc.center.y, arc.radius, arc.startAngleDegrees * Math.PI / 180, arc.endAngleDegrees * Math.PI / 180, pixiArcRunsAnticlockwise(arc.startAngleDegrees, arc.endAngleDegrees))
          .stroke({ color: 0x38bdf8, width: arc.thickness, alpha: 0.8 });
      }
      for (const wall of this.board.walls) {
        this.staticDebugLayer.moveTo(wall.from.x, wall.from.y).lineTo(wall.to.x, wall.to.y)
          .stroke({ color: 0xf87171, width: wall.thickness, alpha: 0.8 });
      }
      for (const gate of visual.gates) {
        this.staticDebugLayer.moveTo(gate.from.x, gate.from.y).lineTo(gate.to.x, gate.to.y)
          .stroke({ color: 0xc084fc, width: gate.thickness, alpha: 0.85 });
      }
      for (const collider of visual.mechanismColliders) {
        this.staticDebugLayer.moveTo(collider.from.x, collider.from.y).lineTo(collider.to.x, collider.to.y)
          .stroke({ color: 0xfbbf24, width: collider.thickness, alpha: 0.8 });
      }
      for (const nail of visual.nails) {
        this.staticDebugLayer.circle(nail.positionX, nail.positionY, nail.radius)
          .fill({ color: 0x22d3ee, alpha: 0.16 }).stroke({ color: 0x22d3ee, width: 0.35, alpha: 0.9 });
      }
    }
    if (debug.sensors) {
      for (const sensor of this.board.sensors) {
        const color = sensor.role === "START" ? 0x4ade80 : sensor.role === "OUT" ? 0xf87171 : 0x60a5fa;
        this.staticDebugLayer.rect(sensor.center.x - sensor.width / 2, sensor.center.y - sensor.height / 2, sensor.width, sensor.height)
          .fill({ color, alpha: 0.16 }).stroke({ color, width: 0.8, alpha: 0.8 });
      }
    }
    if (debug.nailIds) {
      // Labels are recreated only in debug mode; normal rendering remains batched in Graphics.
      for (const nail of visual.nails) {
        const label = new Text({ text: nail.id, style: { fill: 0xa9c2cc, fontSize: 5 } });
        label.position.set(nail.positionX + 2, nail.positionY - 2);
        this.labelLayer.addChild(label);
      }
    }
  }
}
