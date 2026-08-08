import { describe, expect, it } from "vitest";
import { loadBoard } from "./load-board.js";
import { runBatch } from "./index.js";

describe("headless batch runner", () => {
  it("completes 1000 balls with finite metrics and no body leaks", async () => {
    const metrics = await runBatch({ board: await loadBoard(), balls: 1000, seed: 123456, launchPower: 0.68, fireRate: 100 });
    expect(metrics.ballsLaunched).toBe(1000);
    expect(metrics.startEntries + metrics.outEntries + metrics.otherPocketEntries + metrics.timeouts).toBe(1000);
    expect(metrics.finite).toBe(true);
    expect(metrics.remainingBodies).toBe(0);
    for (const value of Object.values(metrics)) if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
  });
});
