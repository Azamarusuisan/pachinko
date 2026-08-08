# Physics Model

## Units and coordinate system

Rapier receives SI units only: metres, kilograms, seconds. Board JSON uses millimetres and grams at the authoring boundary. `x` increases rightward and `y` increases downward, so gravity is `(0, +9.80665 × gravityScale)`.

Nails are fixed circular cross-sections; the steel ball remains dynamic and transfers
tangential impulse into spin through collider friction. Rapier's established solver,
CCD, and contact length scale are retained together because isolated solver changes
materially alter the calibrated launch rail instead of only improving nail resolution.

Kinematic mechanisms support both continuous `ROTATE` motion and deterministic
`OSCILLATE` motion with amplitude, frequency, and phase. The latter is the physical
primitive for hanemono pickup wings; it changes an actual Rapier collider and is not
a renderer-only animation. Hanemono boards remain a separate gauge family and are
not mixed into the Eva-15-type digital-pachinko board.

The nominal ball is 11 mm diameter and 5.55 g. Board dimensions target 500 × 500 mm. Nail geometry and material values on the prototype are calibration values, not verified measurements.

## Stepping

The default physics rate is 240 Hz and `dt = 1 / physicsHz`. Interactive playback uses an accumulator:

1. Clamp pathological wall-clock deltas.
2. Add `wallDelta × simulationSpeed` to the accumulator.
3. Execute whole fixed steps only.
4. Render between previous/current snapshots using `alpha = accumulator / fixedDt`.

Simulation speed changes work performed per wall-clock frame, not `dt`, auto-fire intervals, or event timestamps. Headless runs step explicit ticks and have no render clock.

## Collision model

Balls are dynamic circular rigid bodies with CCD enabled by default. Nails are fixed circles. Rails and walls are fixed segment/capsule colliders. Sensors are non-solid cuboids. Gates are kinematic colliders. Active collision events identify sensor transitions and nail hits. Contact force/event data is diagnostics only; no hidden forces guide balls toward START.

Rapier's integration parameters and solver behavior are versioned as part of `physicsVersion`. High-speed CCD tests must show an actual trajectory difference between CCD enabled and disabled under a deliberately tunnelling setup.

## Determinism

No physics path calls `Math.random`. A small seeded integer PRNG generates explicitly configured launcher variation. IDs and command/event processing use monotonic sequence numbers. Same package lock, Rapier/WASM build, board, physics version, seed, and ordered input log are expected to reproduce results on the same runtime.

Bit-for-bit cross-browser/CPU determinism is not promised because WASM engines and floating-point execution may evolve. Regression statistics and replay logs expose drift. Board/physics/Rapier version must accompany saved runs.

## Lifecycle

`SPAWNED → LAUNCHING → PLAYING → ENTERED_POCKET|OUT → DESTROYED`.

Sensors decide pocket/out transitions. Terminal balls remain observable for a short configured delay, are then removed from Rapier, and emit `ball.destroyed`. A maximum lifetime catches stuck balls and classifies them as OUT/timeout without teleporting them.

## Calibration parameters

Gravity scale, ball mass/radius/material/damping, nail radius/material, launch angle/speed mapping, fire rate, and physics Hz are explicitly configurable. Prototype defaults are hypotheses to tune against future image extraction or measured footage, not real-machine specifications.
