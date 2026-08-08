# Architecture

## Goal and boundaries

The platform treats the Rapier world as the authority for ball outcomes. React and PixiJS consume immutable snapshots and issue timestamped input commands; they never reposition a ball to influence an entry. Physics, game/lottery logic, audiovisual effects, 3D presentation, and economy are separate layers.

## Dependency direction

```text
board-schema ─┐
event-system ─┼─> physics-core <─ input command data
              │        │
              │        ├─> headless simulation-runner
              │        └─> read-only snapshots ─> renderer-pixi ─> simulator UI
effect-system <┘                       events ─> future game/audio/effects
economy-core (independent boundary)
```

`physics-core` may depend only on Rapier, `board-schema`, and `event-system`. It must not import React, Pixi, Three, audio/video, networking, storage, lottery logic, or economy code.

## Package responsibilities

- `board-schema`: Zod schemas, editable millimetre/gram format, validated SI conversion.
- `event-system`: discriminated physics events and a synchronous typed event bus with stable listener order.
- `physics-core`: world creation, bodies/colliders, fixed ticks, lifecycle, sensors, snapshots, seeded variation, replay commands.
- `renderer-pixi`: viewport-independent mapping and interpolated rendering/debug overlays.
- `input-system`: manual/automatic fire scheduling in simulation time.
- `effect-system`: effect/audio manifests, registries, lazy loader/cache interfaces.
- `economy-core`: integer currency and append-only ledger contracts; redemption disabled.
- `simulation-runner`: render-free batch runner, metrics, regression scenarios.
- `simulator`: composition root and responsive controls.

## State and event flow

UI input becomes an input command containing a physics tick. The simulation consumes commands in `(tick, sequence)` order. Each fixed step records previous transforms, advances Rapier once, drains collision events, updates sensor occupancy and lifecycle, then emits events in stable order and publishes a snapshot. Consumers may react to events but cannot mutate the world except through future commands.

## Extension boundaries

Mechanism visuals (GLB/glTF) are separate from mechanism colliders. An eventual game-logic layer may translate `sensor.enter` into lottery/effect selection without changing the physical entry. Asset systems load manifests lazily rather than importing hundreds of effects at startup.

## Repository assumption

This project is isolated at `/Users/stork/pachinko-sim`; the pre-existing `/Users/stork/hallmark-site` is unrelated and untouched.
