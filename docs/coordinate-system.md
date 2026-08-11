# Coordinate System Audit

## Canonical space

Board JSON millimetres are the canonical authoring space.

- origin: board top-left
- +X: right
- +Y: down
- board bounds: `[0, width] × [0, height]`
- points describe collider/sprite centres unless a segment explicitly supplies `from` and `to`

JSON, Rapier, and Pixi retain the same origin and axis directions. There is no Y-axis inversion in
the 2D path.

## Conversion path

```text
Board JSON / world authoring
  point_mm = (x_mm, y_mm)
          │ ÷ 1000
          ▼
Rapier SI
  point_m = (x_mm / 1000, y_mm / 1000)
          │ × 1000, then uniform viewport scale + letterbox origin
          ▼
Pixi render pixels
  point_px = origin_px + point_mm × scale_px_per_mm
```

The inverse is unique:

```text
point_mm = (point_px - origin_px) / scale_px_per_mm
point_m  = point_mm / 1000
```

`packages/board-schema/src/transform.ts` owns these conversions:

- `worldMmToPhysics`
- `physicsToWorldMm`
- `createBoardRenderTransform`
- `worldMmToRender` / `renderToWorldMm` / `physicsToRender`

## Render layout

For board size `(Bw, Bh)` millimetres and Pixi viewport `(Vw, Vh)` pixels:

```text
scale_px_per_mm = min(Vw / Bw, Vh / Bh)
origin_x_px = (Vw - Bw × scale) / 2
origin_y_px = (Vh - Bh × scale) / 2
```

All Pixi board geometry is authored in canonical millimetres inside one transformed world
container. `PixiBoardRenderer` gets that container's scale and position from
`createBoardRenderTransform`. Physics snapshots use `physicsToWorldMm` before entering the same
container; `physicsToRender` is the equivalent direct conversion. There is no separate collider or
sprite coordinate transform. Device-pixel ratio changes backing resolution only.

## Collider centres and shapes

- ball: Rapier rigid-body translation is the circle centre; radius is SI metres
- nail: JSON `(positionX, positionY)` is the fixed-collider centre and rendered nail-cap centre;
  visual and physical radii may differ
- sensor: JSON `center` is the cuboid centre; width/height extend equally on both sides
- straight rail/wall/gate and non-dynamic segment mechanism: body translation is the midpoint of
  `from`/`to`; the capsule's local Y axis is rotated by `atan2(dy, dx) + π/2`
- dynamic mechanism: body translation is its configured pivot; each capsule's local centre is the
  segment midpoint relative to that pivot
- arc rail: `segments + 1` sampled vertices form one Rapier `polyline` collider; contact skin is
  `thickness / 2`. `segments` controls sampling resolution, not collider count
- `fixed-outline-v1`: connected fixed segments form one closed vertex loop and one continuous
  `roundConvexPolyline` collider with rounding radius `thickness / 2`; it is not a set of capsules
- moving mechanism: Rapier body translation/rotation is authoritative. The engine derives SI-metre
  world endpoints into `SimulationSnapshot.mechanisms`; the renderer converts those endpoints with
  the shared transform

The moving-object path is therefore:

```text
Rapier body state (m) → SimulationSnapshot endpoints (m) → physicsToWorldMm
                      → Pixi world container scale + letterbox origin → pixels
```

Pixi does not rotate a second mechanism sprite independently of the physics body.

## Cabinet image boundary

The cabinet PNG is decorative and is not a source of collider coordinates. The square board viewport
is calibrated over the cabinet artwork; physics and debug geometry share the transform above. Any
future image calibration must produce board-space control points or a homography feeding this same
transform boundary. Pixel measurements must never be copied directly into engine configuration.

## Tests

`packages/board-schema/src/transform.test.ts` verifies metre/millimetre round-trip, top-left origin,
positive-down Y, uniform scale, letterbox origin, and inverse render mapping.
