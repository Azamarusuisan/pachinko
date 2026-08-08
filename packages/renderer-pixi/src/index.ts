import { Application, Container, Graphics, Text } from "pixi.js";
import type { BoardDefinition } from "@pachinko/board-schema";
import type { SimulationSnapshot } from "@pachinko/physics-core";

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
  private readonly labelLayer = new Container();
  private readonly ballLayer = new Container();
  private readonly trails = new Map<string, Array<{ x: number; y: number }>>();
  private resizeObserver: ResizeObserver | null = null;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;

  constructor(private readonly board: BoardDefinition) {}

  async mount(host: HTMLElement, debug: DebugDrawOptions): Promise<void> {
    await this.app.init({ backgroundAlpha: 0, antialias: true, resizeTo: host, resolution: window.devicePixelRatio, autoDensity: true });
    host.replaceChildren(this.app.canvas);
    this.app.stage.addChild(this.world);
    this.world.addChild(this.staticLayer, this.labelLayer, this.ballLayer);
    this.resizeObserver = new ResizeObserver(() => { this.layout(); this.drawStatic(debug); });
    this.resizeObserver.observe(host);
    this.layout();
    this.drawStatic(debug);
  }

  render(snapshot: SimulationSnapshot, alpha: number, debug: DebugDrawOptions): void {
    this.ballLayer.removeChildren().forEach((child) => child.destroy());
    for (const ball of snapshot.balls) {
      const xMeters = ball.previousPosition.x + (ball.position.x - ball.previousPosition.x) * alpha;
      const yMeters = ball.previousPosition.y + (ball.position.y - ball.previousPosition.y) * alpha;
      const x = xMeters * 1000;
      const y = yMeters * 1000;
      if (debug.ballTrails) {
        const trail = this.trails.get(ball.id) ?? [];
        trail.push({ x, y });
        if (trail.length > 28) trail.shift();
        this.trails.set(ball.id, trail);
        const trailGraphic = new Graphics();
        if (trail.length > 1) {
          trailGraphic.moveTo(trail[0]?.x ?? x, trail[0]?.y ?? y);
          for (const point of trail.slice(1)) trailGraphic.lineTo(point.x, point.y);
          trailGraphic.stroke({ color: 0x5bc0eb, width: 0.8, alpha: 0.32 });
        }
        this.ballLayer.addChild(trailGraphic);
      }
      const graphic = new Graphics().circle(x, y, ball.radius * 1000)
        .fill({ color: 0xe9f2f5 }).stroke({ color: 0x8fd3ee, width: 0.8 });
      this.ballLayer.addChild(graphic);
      if (debug.velocityVectors) {
        const vector = new Graphics().moveTo(x, y).lineTo(x + ball.velocity.x * 18, y + ball.velocity.y * 18)
          .stroke({ color: 0xffd166, width: 1.2 });
        this.ballLayer.addChild(vector);
      }
      if (debug.angularVelocity) {
        const marker = new Graphics().arc(x, y, 8, 0, Math.min(Math.PI * 2, Math.abs(ball.angularVelocity) * 0.15))
          .stroke({ color: 0xf78c6b, width: 1 });
        this.ballLayer.addChild(marker);
      }
      if (debug.ballIds) {
        const label = new Text({ text: ball.id, style: { fill: 0xffffff, fontSize: 7 } });
        label.position.set(x + 7, y - 7);
        this.ballLayer.addChild(label);
      }
    }
    for (const contact of snapshot.contacts) {
      const x = contact.point.x * 1000;
      const y = contact.point.y * 1000;
      if (debug.collisionPoints) {
        this.ballLayer.addChild(new Graphics().circle(x, y, 2.2).fill({ color: 0xff5d8f, alpha: 0.95 }));
      }
      if (debug.collisionNormals) {
        this.ballLayer.addChild(new Graphics().moveTo(x, y).lineTo(x + contact.normal.x * 18, y + contact.normal.y * 18)
          .stroke({ color: 0xff5d8f, width: 1.2 }));
      }
    }
    const active = new Set(snapshot.balls.map((ball) => ball.id));
    for (const id of this.trails.keys()) if (!active.has(id)) this.trails.delete(id);
    this.drawStatic(debug);
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.app.destroy(true, { children: true });
  }

  private layout(): void {
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    this.scale = Math.min(width / this.board.board.width, height / this.board.board.height);
    this.offsetX = (width - this.board.board.width * this.scale) / 2;
    this.offsetY = (height - this.board.board.height * this.scale) / 2;
    this.world.scale.set(this.scale);
    this.world.position.set(this.offsetX, this.offsetY);
  }

  private drawStatic(debug: DebugDrawOptions): void {
    this.staticLayer.clear();
    this.labelLayer.removeChildren().forEach((child) => child.destroy());
    // The visual cabinet image is decorative. Draw the authoritative physics gauge
    // over it so every visible foreground nail is also a real collider.
    this.staticLayer.circle(250, 250, 224).fill({ color: 0x08070a, alpha: 0.34 });
    for (const rail of this.board.rails) {
      this.staticLayer.moveTo(rail.from.x, rail.from.y).lineTo(rail.to.x, rail.to.y)
        .stroke({ color: 0xb8c2c7, width: rail.thickness, alpha: 0.72 });
    }
    for (const arc of this.board.arcRails) {
      this.staticLayer.arc(arc.center.x, arc.center.y, arc.radius, arc.startAngleDegrees * Math.PI / 180, arc.endAngleDegrees * Math.PI / 180)
        .stroke({ color: 0xb8c2c7, width: arc.thickness, alpha: 0.72 });
    }
    for (const nail of this.board.nails.filter((value) => value.enabled)) {
      this.staticLayer.circle(nail.positionX + 0.6, nail.positionY + 0.7, nail.radius + 0.55).fill({ color: 0x000000, alpha: 0.46 });
      this.staticLayer.circle(nail.positionX, nail.positionY, nail.radius + 0.35)
        .fill({ color: 0xf0f2ee }).stroke({ color: 0x77858c, width: 0.45 });
    }
    if (debug.colliders) {
      const mechanismColliders = this.board.mechanisms.filter((mechanism) => mechanism.enabled).flatMap((mechanism) => mechanism.colliders);
      for (const segment of [...this.board.rails, ...this.board.walls, ...this.board.gates.filter((gate) => gate.enabled), ...mechanismColliders]) {
        this.staticLayer.moveTo(segment.from.x, segment.from.y).lineTo(segment.to.x, segment.to.y)
          .stroke({ color: 0x78a6b8, width: segment.thickness });
      }
      for (const arc of this.board.arcRails) {
        this.staticLayer.arc(arc.center.x, arc.center.y, arc.radius, arc.startAngleDegrees * Math.PI / 180, arc.endAngleDegrees * Math.PI / 180)
          .stroke({ color: 0x78a6b8, width: arc.thickness });
      }
      for (const nail of this.board.nails.filter((value) => value.enabled)) {
        this.staticLayer.circle(nail.positionX, nail.positionY, nail.radius)
          .fill({ color: 0xc6d8df }).stroke({ color: 0x6b8793, width: 0.35 });
      }
    }
    if (debug.sensors) {
      for (const sensor of this.board.sensors) {
        const color = sensor.role === "START" ? 0x4ade80 : sensor.role === "OUT" ? 0xf87171 : 0x60a5fa;
        this.staticLayer.rect(sensor.center.x - sensor.width / 2, sensor.center.y - sensor.height / 2, sensor.width, sensor.height)
          .fill({ color, alpha: 0.16 }).stroke({ color, width: 0.8, alpha: 0.8 });
      }
    }
    if (debug.nailIds) {
      // Labels are recreated only in debug mode; normal rendering remains batched in Graphics.
      for (const nail of this.board.nails.filter((value) => value.enabled)) {
        const label = new Text({ text: nail.id, style: { fill: 0xa9c2cc, fontSize: 5 } });
        label.position.set(nail.positionX + 2, nail.positionY - 2);
        this.labelLayer.addChild(label);
      }
    }
  }
}
