import { describe, expect, it } from "vitest";
import { TypedEventBus, type PhysicsEvent } from "./index.js";

describe("typed event bus", () => {
  it("preserves subscription order and supports unsubscribe", () => {
    const bus = new TypedEventBus();
    const received: string[] = [];
    bus.onAny((event) => received.push(`all:${event.type}`));
    const unsubscribe = bus.on("ball.spawned", (event) => received.push(`typed:${event.ballId}`));
    const event: PhysicsEvent = { type: "ball.spawned", ballId: "ball-1", simulationTime: 0, tick: 0 };
    bus.emit(event);
    unsubscribe();
    bus.emit(event);
    expect(received).toEqual(["all:ball.spawned", "typed:ball-1", "all:ball.spawned"]);
  });
});
