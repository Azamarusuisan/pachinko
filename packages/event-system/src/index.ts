export interface Vector2 { readonly x: number; readonly y: number }

interface BaseEvent { readonly ballId: string; readonly simulationTime: number; readonly tick: number }
export type PhysicsEvent =
  | (BaseEvent & { readonly type: "ball.spawned" })
  | (BaseEvent & { readonly type: "ball.launched"; readonly velocity: Vector2 })
  | (BaseEvent & { readonly type: "ball.collision"; readonly colliderId: string })
  | (BaseEvent & { readonly type: "nail.hit"; readonly nailId: string })
  | (BaseEvent & { readonly type: "sensor.enter"; readonly sensorId: string; readonly role: string })
  | (BaseEvent & { readonly type: "sensor.exit"; readonly sensorId: string; readonly role: string })
  | (BaseEvent & { readonly type: "ball.out"; readonly sensorId: string })
  | (BaseEvent & { readonly type: "ball.destroyed"; readonly reason: "terminal" | "timeout" });

export type PhysicsEventType = PhysicsEvent["type"];
export type PhysicsEventOf<T extends PhysicsEventType> = Extract<PhysicsEvent, { type: T }>;
export type Unsubscribe = () => void;

export class TypedEventBus {
  private readonly allListeners = new Set<(event: PhysicsEvent) => void>();
  private readonly typedListeners = new Map<PhysicsEventType, Set<(event: PhysicsEvent) => void>>();

  onAny(listener: (event: PhysicsEvent) => void): Unsubscribe {
    this.allListeners.add(listener);
    return () => this.allListeners.delete(listener);
  }

  on<T extends PhysicsEventType>(type: T, listener: (event: PhysicsEventOf<T>) => void): Unsubscribe {
    const listeners = this.typedListeners.get(type) ?? new Set<(event: PhysicsEvent) => void>();
    const generalListener = listener as (event: PhysicsEvent) => void;
    listeners.add(generalListener);
    this.typedListeners.set(type, listeners);
    return () => listeners.delete(generalListener);
  }

  emit(event: PhysicsEvent): void {
    for (const listener of this.allListeners) listener(event);
    for (const listener of this.typedListeners.get(event.type) ?? []) listener(event);
  }
}
