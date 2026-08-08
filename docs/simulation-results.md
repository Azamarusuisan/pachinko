# Phase 1 Simulation Results

Recorded on 2026-08-08 with board `eva15_inspired_physics_v1`, board version
`1.0.1-reference-approximation`, seed `123456`, launch power `0.68`, 100
balls/min, 240 Hz, and CCD enabled. The layout is a reference-based
approximation, not a claim of measured real-machine nail coordinates.

| Balls | START | OUT | Other | Timeout | START rate | Avg lifetime | Avg collisions | Left | Center | Right | Wall time |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 11 | 82 | 7 | 0 | 11.00% | 0.6662 s | 6.470 | 3.00% | 20.00% | 77.00% | 0.142 s |
| 1,000 | 73 | 885 | 42 | 0 | 7.30% | 0.6573 s | 6.058 | 1.80% | 13.70% | 84.50% | 1.034 s |
| 10,000 | 691 | 8,974 | 335 | 0 | 6.91% | 0.6542 s | 5.995 | 1.61% | 13.82% | 84.57% | 9.786 s |

All three runs completed with finite values and no destroyed ball rigid bodies
remaining in the Rapier world. The 1,000-ball result is the Golden Simulation
baseline stored under `tools/simulation-runner/golden/`.

## Current calibrated physics parameters

- SI units internally; board authoring in millimeters and grams
- Gravity: `9.80665 m/s²`; effective gravity scale: `1.0`
- Physics: `240 Hz` default, selectable `120/240/480 Hz`
- Ball diameter: `11 mm`; mass: `5.55 g`
- Ball restitution: `0.4`; friction: `0.1`; CCD: enabled
- Maximum launch velocity: `5.2 m/s`
- Launch angular jitter: `0.42°`, produced by seeded RNG
- REALISTIC fire rate: `100 balls/min` (`600 ms` physics-time interval)

See `calibration-log.md` for rejected trials and the reasons they were not kept.

## Research rebuild v2

Recorded with board `eva15_inspired_physics_v2`, version
`2.0.0-research-rebuild`, seed `123456`, power `0.68`, 100 balls/min, 240 Hz,
and CCD enabled.

| Balls | START | OUT | Other | Timeout | START rate | Avg lifetime | Avg collisions | Left | Center | Right | Wall time |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 50 | 765 | 185 | 0 | 5.00% | 1.5344 s | 19.394 | 28.00% | 13.40% | 58.60% | 2.235 s |
| 10,000 | 464 | 7,536 | 2,000 | 0 | 4.64% | 1.5313 s | 19.410 | 27.72% | 12.76% | 59.52% | 22.014 s |

The v2 Golden baseline is stored separately as
`tools/simulation-runner/golden/eva15_v2_seed123456_1000.json`; v1 evidence was
not overwritten. The rebuild adds deterministic arc rails, a physical center
outline, rotating kinematic windmills, non-terminal WARP sensing, named
life/jump/hakama nail groups, an 11.5 mm effective START opening, a visible OUT
opening, and a below-board collection sensor.

## Right-play rebuild 2.1

Recorded with board version `2.1.0-right-play-rebuild`, physics
`phase1-rapier-0.19.3-v2`, seed `123456`, 100 balls/min, 240 Hz, and CCD.

| Mode | Power | Balls | START | OUT | Other | Timeout | Left route | Center | Right route | Avg collisions |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Left-play calibration | 0.68 | 10,000 | 3,446 | 5,725 | 829 | 0 | 88.55% | 1.09% | 10.36% | 19.8526 |
| Right-play calibration | 1.00 | 10,000 | 285 | 3,071 | 6,644 | 0 | 4.93% | 0.21% | 94.86% | 9.3844 |

The routes share one launcher. A fixed upper return separates the high-energy
shot, and an `UPWARD_ONLY` inner-rail gate uses per-ball Rapier collision groups:
ascending balls stay inside the launch rail while descending balls can enter the
right gauge. Right play includes distinct THROUGH, ELECTRIC_SUPPORT, ATTACKER,
and OUT sensing. No teleport or post-launch velocity rewrite is used.

The current START rate is a calibration result, not a claim about an official
Eva 15 gauge. Exact manufacturer nail coordinates and adjustment data remain
unpublished and are not inferred as measured values.
