export interface Point2D { readonly x: number; readonly y: number }
export interface Size2D { readonly width: number; readonly height: number }

export const MILLIMETERS_PER_METER = 1000;

export const millimetersToMeters = (value: number): number => value / MILLIMETERS_PER_METER;
export const metersToMillimeters = (value: number): number => value * MILLIMETERS_PER_METER;

export const worldMmToPhysics = (point: Point2D): Point2D => ({
  x: millimetersToMeters(point.x),
  y: millimetersToMeters(point.y),
});

export const physicsToWorldMm = (point: Point2D): Point2D => ({
  x: metersToMillimeters(point.x),
  y: metersToMillimeters(point.y),
});

export interface BoardRenderTransform {
  readonly scalePixelsPerMillimeter: number;
  readonly originPixels: Point2D;
  worldMmToRender(point: Point2D): Point2D;
  renderToWorldMm(point: Point2D): Point2D;
  physicsToRender(point: Point2D): Point2D;
  worldLengthToRender(lengthMillimeters: number): number;
}

/**
 * The board uses one top-left origin and +Y points down in JSON, Rapier, and Pixi.
 * Rendering only adds uniform scale and letterbox offset; it never changes physics.
 */
export function createBoardRenderTransform(board: Size2D, viewport: Size2D): BoardRenderTransform {
  if (board.width <= 0 || board.height <= 0 || viewport.width < 0 || viewport.height < 0) {
    throw new Error("Board dimensions must be positive and viewport dimensions nonnegative");
  }
  const scalePixelsPerMillimeter = Math.min(viewport.width / board.width, viewport.height / board.height);
  const originPixels = {
    x: (viewport.width - board.width * scalePixelsPerMillimeter) / 2,
    y: (viewport.height - board.height * scalePixelsPerMillimeter) / 2,
  };
  const worldMmToRender = (point: Point2D): Point2D => ({
    x: originPixels.x + point.x * scalePixelsPerMillimeter,
    y: originPixels.y + point.y * scalePixelsPerMillimeter,
  });
  return {
    scalePixelsPerMillimeter,
    originPixels,
    worldMmToRender,
    renderToWorldMm: (point) => ({
      x: (point.x - originPixels.x) / scalePixelsPerMillimeter,
      y: (point.y - originPixels.y) / scalePixelsPerMillimeter,
    }),
    physicsToRender: (point) => worldMmToRender(physicsToWorldMm(point)),
    worldLengthToRender: (lengthMillimeters) => lengthMillimeters * scalePixelsPerMillimeter,
  };
}
