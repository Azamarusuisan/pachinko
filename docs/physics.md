# Physics Model

## Units and coordinate system

Rapier receives SI units only: metres, kilograms, seconds. Board JSON uses millimetres and grams at the authoring boundary. `x` increases rightward and `y` increases downward, so gravity is `(0, +9.80665 × gravityScale)`.

Nails are fixed circular cross-sections; the steel ball remains dynamic and transfers
tangential impulse into spin through collider friction. Rapier's established solver,
CCD, and contact length scale are retained together because isolated solver changes
materially alter the calibrated launch rail instead of only improving nail resolution.

Rapier's `lengthUnit` is set to the 11 mm ball diameter instead of its 1 m default, so
contact tolerances are scaled for millimetre hardware. Ball mass properties use the
solid-sphere inertia `2/5 mr²`; Rapier 2D's default disc inertia would be 25% larger.

Kinematic mechanisms support both continuous `ROTATE` motion and deterministic
`OSCILLATE` motion with amplitude, frequency, and phase. The latter is the physical
primitive for hanemono pickup wings; it changes an actual Rapier collider and is not
a renderer-only animation. Hanemono boards remain a separate gauge family and are
not mixed into the Eva-15-type digital-pachinko board.

Ordinary windmills are passive dynamic bodies with translation locked at the configured
pivot. They remain still until a ball supplies torque, then slow through configured angular
damping. Kinematic rotation remains available for genuinely driven mechanisms only.

The prototype ball is 11 mm diameter and 5.45 g. Its diameter is regulated; its mass follows
an industry-typical product reference within the regulated 5.4–5.7 g range. Nail collision
radius is 0.92 mm, based on a published 1.8–1.9 mm shaft range. Board dimensions target
500 × 500 mm. Material coefficients remain unmeasured calibration hypotheses.

## Stepping

The rate and substep count are configuration. The current prototype uses a 240 Hz outer step with
16 fixed Rapier substeps, giving a 1/3840 s Rapier step. This is a provisional resolution baseline,
not proof of full-board statistical convergence. Interactive playback uses an accumulator:

1. Clamp pathological wall-clock deltas.
2. Add `wallDelta × simulationSpeed` to the accumulator.
3. Execute whole fixed steps only.
4. Render between previous/current snapshots using `alpha = accumulator / fixedDt`.

Simulation speed changes work performed per wall-clock frame, not `dt`, auto-fire intervals, or event timestamps. Headless runs step explicit ticks and have no render clock.

## Collision model

Balls are dynamic circles with CCD enabled by default. Nails are fixed circles. Straight rails and
walls are fixed capsule colliders; gates use the same capsule geometry on kinematic bodies. Sensors
are fixed, non-solid cuboids.

Each arc rail is one Rapier `polyline` collider built from sampled arc vertices. Its contact skin is
half the configured thickness. It is not expanded into separate capsule colliders. A fixed
`fixed-outline-v1` mechanism validates a connected, closed, single-material convex loop and creates
one continuous `roundConvexPolyline` collider with rounding radius equal to half its thickness.

Active collision events identify sensor transitions and solid hits. Contact force/event data is
diagnostics only; no hidden forces guide balls toward START.

## Moving mechanism synchronization

Rapier is the source of truth for moving mechanisms. Driven kinematic bodies receive their next
rotation before each Rapier substep; passive dynamic windmills rotate only from physics impulses and
damping. After stepping, the engine derives each collider's world endpoints from its Rapier body
translation and rotation and publishes them in `SimulationSnapshot.mechanisms`. The renderer then
uses the shared metre-to-millimetre-to-Pixi transform. No independent Pixi rotation is applied.

The model remains quasi-2D. A real 11 mm ball moves between a board and glass separated by
more than 13 mm and at most 25 mm, so board/glass contact and three-axis spin are folded into
effective 2D material parameters. Those effects cannot be claimed as first-principles reproduction
until side-view/high-speed observations or a 2.5D/3D model are available.

Rapier's integration parameters and solver behavior are versioned as part of `physicsVersion`. High-speed CCD tests must show an actual trajectory difference between CCD enabled and disabled under a deliberately tunnelling setup.

## Determinism

No physics path calls `Math.random`. A small seeded integer PRNG generates explicitly configured launcher variation. IDs and command/event processing use monotonic sequence numbers. Same package lock, Rapier/WASM build, board, physics version, seed, and ordered input log are expected to reproduce results on the same runtime.

Bit-for-bit cross-browser/CPU determinism is not promised because WASM engines and floating-point execution may evolve. Regression statistics and replay logs expose drift. Board/physics/Rapier version must accompany saved runs.

## Lifecycle

`SPAWNED → LAUNCHING → PLAYING → ENTERED_POCKET|OUT → DESTROYED`.

Sensors decide pocket/out transitions. Terminal balls remain observable for a short configured delay, are then removed from Rapier, and emit `ball.destroyed`. A maximum lifetime catches stuck balls and classifies them as OUT/timeout without teleporting them.

## Calibration parameters

Gravity scale, ball mass/radius/material/damping, nail radius/material, launch angle/speed mapping, fire rate, and physics Hz are explicitly configurable. Prototype defaults are hypotheses to tune against future image extraction or measured footage, not real-machine specifications.
