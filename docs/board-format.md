# Board JSON Format

Boards are authored in millimetres and grams, validated by Zod, and converted once to an SI-domain model. Unknown keys are rejected to catch misspellings. IDs are unique within their object categories and sensor roles are explicit.

Core sections:

- `id`, `version`, `units: "mm"`, `reference`: provenance and approximation disclaimer.
- `board`: dimensions and route split boundaries.
- `physics`: gravity, scale, selectable frequency, damping, maximum lifetime.
- `ball`: diameter, mass in grams, restitution, friction.
- `launcher`: spawn point, angle, min/max velocity, optional seeded angle jitter.
- `nails`: fixed circles with id, position, radius, material, enabled flag, group.
- `rails` / `walls`: line segments with thickness and material.
- `arcRails`: editable circular rails expanded to deterministic Rapier capsule segments.
- `sensors`: axis-aligned sensor rectangles with `START`, `OUT`, `POCKET`, `WARP`, or route roles.
- `gates`: kinematic segments and initial state.
- `mechanisms`: enabled adapter records containing independent `FIXED` or `KINEMATIC` segment colliders and an optional fixed-time angular velocity. These are physics data, never extracted from a GLB mesh at runtime.
- `gates`: segment colliders with `BIDIRECTIONAL` or `UPWARD_ONLY` collision.
  The one-way mode is implemented with per-ball collision groups: rising balls
  collide and falling balls pass. It is used for launch-rail ball-stop behavior.

Coordinates use top-left board origin; positive y points down. Renderer scale is derived independently from board width/height and never enters this file.

Editor operations clone the validated authoring model, change coordinates in exact decimal millimetres (0.1/0.5/1 mm UI increments), revalidate, and export JSON. Runtime calibration overrides are marked dirty and are not silently persisted.

Arc loading uses the declared segment count and stable IDs, so the same board
definition produces the same Rapier geometry on every viewport. A `WARP`
sensor emits events without terminating or teleporting the ball; future depth
transitions require an explicit mechanism adapter.
