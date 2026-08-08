import { z } from "zod";

const id = z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/);
const finite = z.number().finite();
const nonnegative = finite.nonnegative();
const positive = finite.positive();
const material = {
  friction: z.number().min(0).max(2),
  restitution: z.number().min(0).max(1),
} as const;

const pointSchema = z.strictObject({ x: finite, y: finite });
const segmentSchema = z.strictObject({
  id,
  from: pointSchema,
  to: pointSchema,
  thickness: positive,
  ...material,
});

export const arcRailSchema = z.strictObject({
  id,
  center: pointSchema,
  radius: positive,
  startAngleDegrees: finite,
  endAngleDegrees: finite,
  segments: z.number().int().min(4).max(128),
  thickness: positive,
  ...material,
});

export const mechanismColliderSchema = segmentSchema.extend({
  bodyType: z.enum(["FIXED", "KINEMATIC"]),
});

export const nailSchema = z.strictObject({
  id,
  positionX: finite,
  positionY: finite,
  radius: positive,
  ...material,
  enabled: z.boolean(),
  group: z.string().min(1),
});

export const sensorSchema = z.strictObject({
  id,
  role: z.enum(["START", "OUT", "POCKET", "WARP", "THROUGH", "ELECTRIC_SUPPORT", "ATTACKER", "ROUTE_LEFT", "ROUTE_CENTER", "ROUTE_RIGHT"]),
  center: pointSchema,
  width: positive,
  height: positive,
});

export const boardSchema = z.strictObject({
  id,
  version: z.string().min(1),
  units: z.literal("mm"),
  reference: z.strictObject({
    kind: z.literal("reference-based-approximation"),
    description: z.string().min(1),
    measured: z.literal(false),
  }),
  board: z.strictObject({
    width: positive.max(500),
    height: positive.max(500),
    routeBoundariesX: z.tuple([finite, finite]),
  }),
  physics: z.strictObject({
    gravity: positive,
    gravityScale: positive,
    physicsHz: z.union([z.literal(120), z.literal(240), z.literal(480)]),
    linearDamping: nonnegative,
    angularDamping: nonnegative,
    maxBallLifetimeSeconds: positive,
    terminalRetentionSeconds: nonnegative,
  }),
  ball: z.strictObject({
    diameter: positive,
    massGrams: positive,
    ...material,
  }),
  launcher: z.strictObject({
    position: pointSchema,
    angleDegrees: finite,
    minVelocity: nonnegative,
    maxVelocity: positive,
    angleJitterDegrees: nonnegative,
  }).refine((value) => value.maxVelocity >= value.minVelocity, "maxVelocity must be >= minVelocity"),
  nails: z.array(nailSchema),
  rails: z.array(segmentSchema),
  arcRails: z.array(arcRailSchema).default([]),
  walls: z.array(segmentSchema),
  sensors: z.array(sensorSchema),
  gates: z.array(segmentSchema.extend({
    enabled: z.boolean(),
    collisionMode: z.enum(["BIDIRECTIONAL", "UPWARD_ONLY"]).default("BIDIRECTIONAL"),
  })),
  mechanisms: z.array(z.strictObject({
    id,
    adapter: z.string().min(1),
    enabled: z.boolean(),
    angularVelocityDegreesPerSecond: finite.default(0),
    motion: z.enum(["ROTATE", "OSCILLATE"]).default("ROTATE"),
    oscillationAmplitudeDegrees: nonnegative.default(0),
    oscillationFrequencyHz: nonnegative.default(0),
    phaseDegrees: finite.default(0),
    colliders: z.array(mechanismColliderSchema),
  })),
}).superRefine((board, context) => {
  const collections = [board.nails, board.rails, board.arcRails, board.walls, board.sensors, board.gates];
  for (const collection of collections) {
    const seen = new Set<string>();
    for (const item of collection) {
      if (seen.has(item.id)) {
        context.addIssue({ code: "custom", message: `Duplicate id: ${item.id}` });
      }
      seen.add(item.id);
    }
  }
  const mechanismIds = new Set<string>();
  for (const mechanism of board.mechanisms) {
    if (mechanismIds.has(mechanism.id)) context.addIssue({ code: "custom", message: `Duplicate mechanism id: ${mechanism.id}` });
    mechanismIds.add(mechanism.id);
    const colliderIds = new Set<string>();
    for (const collider of mechanism.colliders) {
      if (colliderIds.has(collider.id)) context.addIssue({ code: "custom", message: `Duplicate mechanism collider id: ${mechanism.id}/${collider.id}` });
      colliderIds.add(collider.id);
    }
  }
  const [left, right] = board.board.routeBoundariesX;
  if (!(left < right && left >= 0 && right <= board.board.width)) {
    context.addIssue({ code: "custom", message: "Invalid route boundaries" });
  }
});

export type BoardDefinition = z.infer<typeof boardSchema>;
export type NailDefinition = z.infer<typeof nailSchema>;
export type SensorDefinition = z.infer<typeof sensorSchema>;
export type MechanismColliderDefinition = z.infer<typeof mechanismColliderSchema>;

export interface PointMeters { readonly x: number; readonly y: number }
export interface SegmentMeters {
  readonly id: string;
  readonly from: PointMeters;
  readonly to: PointMeters;
  readonly thickness: number;
  readonly friction: number;
  readonly restitution: number;
}
export interface BoardSI {
  readonly source: BoardDefinition;
  readonly width: number;
  readonly height: number;
  readonly routeBoundariesX: readonly [number, number];
  readonly gravity: number;
  readonly ball: { readonly radius: number; readonly mass: number; readonly friction: number; readonly restitution: number };
  readonly launcher: {
    readonly position: PointMeters;
    readonly angleRadians: number;
    readonly minVelocity: number;
    readonly maxVelocity: number;
    readonly angleJitterRadians: number;
  };
  readonly nails: readonly (NailDefinition & { readonly xMeters: number; readonly yMeters: number; readonly radiusMeters: number })[];
  readonly rails: readonly SegmentMeters[];
  readonly walls: readonly SegmentMeters[];
  readonly sensors: readonly (SensorDefinition & { readonly centerMeters: PointMeters; readonly widthMeters: number; readonly heightMeters: number })[];
  readonly gates: readonly (SegmentMeters & { readonly enabled: boolean; readonly collisionMode: "BIDIRECTIONAL" | "UPWARD_ONLY" })[];
  readonly mechanisms: readonly {
    readonly id: string;
    readonly adapter: string;
    readonly angularVelocityRadiansPerSecond: number;
    readonly motion: "ROTATE" | "OSCILLATE";
    readonly oscillationAmplitudeRadians: number;
    readonly oscillationFrequencyHz: number;
    readonly phaseRadians: number;
    readonly colliders: readonly (SegmentMeters & { readonly bodyType: "FIXED" | "KINEMATIC" })[];
  }[];
}

export const millimetersToMeters = (value: number): number => value / 1000;
export const gramsToKilograms = (value: number): number => value / 1000;
export const degreesToRadians = (value: number): number => value * Math.PI / 180;

const convertPoint = (point: { x: number; y: number }): PointMeters => ({
  x: millimetersToMeters(point.x),
  y: millimetersToMeters(point.y),
});

const convertSegment = (segment: z.infer<typeof segmentSchema>): SegmentMeters => ({
  id: segment.id,
  from: convertPoint(segment.from),
  to: convertPoint(segment.to),
  thickness: millimetersToMeters(segment.thickness),
  friction: segment.friction,
  restitution: segment.restitution,
});

export function parseBoard(input: unknown): BoardDefinition {
  return boardSchema.parse(input);
}

export function createBoardTemplate(overrides: Partial<BoardDefinition> = {}): BoardDefinition {
  const base: BoardDefinition = {
    id: "board_template",
    version: "1",
    units: "mm",
    reference: { kind: "reference-based-approximation", description: "Synthetic validated board template", measured: false },
    board: { width: 500, height: 500, routeBoundariesX: [170, 330] },
    physics: {
      gravity: 9.80665, gravityScale: 1, physicsHz: 240, linearDamping: 0, angularDamping: 0,
      maxBallLifetimeSeconds: 10, terminalRetentionSeconds: 0,
    },
    ball: { diameter: 11, massGrams: 5.55, friction: 0.1, restitution: 0.4 },
    launcher: { position: { x: 20, y: 450 }, angleDegrees: -90, minVelocity: 0, maxVelocity: 5, angleJitterDegrees: 0 },
    nails: [], rails: [], arcRails: [], walls: [], sensors: [], gates: [], mechanisms: [],
  };
  return parseBoard({ ...base, ...overrides });
}

export function toSI(board: BoardDefinition): BoardSI {
  const arcSegments = board.arcRails.flatMap((arc) => {
    const start = degreesToRadians(arc.startAngleDegrees);
    const end = degreesToRadians(arc.endAngleDegrees);
    return Array.from({ length: arc.segments }, (_, index) => {
      const a = start + (end - start) * index / arc.segments;
      const b = start + (end - start) * (index + 1) / arc.segments;
      return convertSegment({
        id: `${arc.id}-${String(index + 1).padStart(2, "0")}`,
        from: { x: arc.center.x + Math.cos(a) * arc.radius, y: arc.center.y + Math.sin(a) * arc.radius },
        to: { x: arc.center.x + Math.cos(b) * arc.radius, y: arc.center.y + Math.sin(b) * arc.radius },
        thickness: arc.thickness,
        friction: arc.friction,
        restitution: arc.restitution,
      });
    });
  });
  return {
    source: board,
    width: millimetersToMeters(board.board.width),
    height: millimetersToMeters(board.board.height),
    routeBoundariesX: board.board.routeBoundariesX.map(millimetersToMeters) as [number, number],
    gravity: board.physics.gravity * board.physics.gravityScale,
    ball: {
      radius: millimetersToMeters(board.ball.diameter / 2),
      mass: gramsToKilograms(board.ball.massGrams),
      friction: board.ball.friction,
      restitution: board.ball.restitution,
    },
    launcher: {
      position: convertPoint(board.launcher.position),
      angleRadians: degreesToRadians(board.launcher.angleDegrees),
      minVelocity: board.launcher.minVelocity,
      maxVelocity: board.launcher.maxVelocity,
      angleJitterRadians: degreesToRadians(board.launcher.angleJitterDegrees),
    },
    nails: board.nails.filter((nail) => nail.enabled).map((nail) => ({
      ...nail,
      xMeters: millimetersToMeters(nail.positionX),
      yMeters: millimetersToMeters(nail.positionY),
      radiusMeters: millimetersToMeters(nail.radius),
    })),
    rails: [...board.rails.map(convertSegment), ...arcSegments],
    walls: board.walls.map(convertSegment),
    sensors: board.sensors.map((sensor) => ({
      ...sensor,
      centerMeters: convertPoint(sensor.center),
      widthMeters: millimetersToMeters(sensor.width),
      heightMeters: millimetersToMeters(sensor.height),
    })),
    gates: board.gates.map((gate) => ({ ...convertSegment(gate), enabled: gate.enabled, collisionMode: gate.collisionMode })),
    mechanisms: board.mechanisms.filter((mechanism) => mechanism.enabled).map((mechanism) => ({
      id: mechanism.id,
      adapter: mechanism.adapter,
      angularVelocityRadiansPerSecond: degreesToRadians(mechanism.angularVelocityDegreesPerSecond),
      motion: mechanism.motion,
      oscillationAmplitudeRadians: degreesToRadians(mechanism.oscillationAmplitudeDegrees),
      oscillationFrequencyHz: mechanism.oscillationFrequencyHz,
      phaseRadians: degreesToRadians(mechanism.phaseDegrees),
      colliders: mechanism.colliders.map((collider) => ({ ...convertSegment(collider), bodyType: collider.bodyType })),
    })),
  };
}
