import { describe, expect, it } from "vitest";
import { createBoardRenderTransform, physicsToWorldMm, worldMmToPhysics } from "./transform.js";

describe("board coordinate transform", () => {
  it("round-trips JSON millimetres through Rapier metres without flipping Y", () => {
    const world = { x: 125, y: 375 };
    const physics = worldMmToPhysics(world);
    expect(physics).toEqual({ x: 0.125, y: 0.375 });
    expect(physicsToWorldMm(physics)).toEqual(world);
  });

  it("uses a top-left origin with uniform Pixi scale and letterboxing", () => {
    const transform = createBoardRenderTransform({ width: 500, height: 500 }, { width: 1200, height: 800 });
    expect(transform.scalePixelsPerMillimeter).toBe(1.6);
    expect(transform.originPixels).toEqual({ x: 200, y: 0 });
    expect(transform.worldMmToRender({ x: 250, y: 500 })).toEqual({ x: 600, y: 800 });
    expect(transform.renderToWorldMm({ x: 600, y: 800 })).toEqual({ x: 250, y: 500 });
    expect(transform.physicsToRender({ x: 0.25, y: 0.5 })).toEqual({ x: 600, y: 800 });
  });
});
