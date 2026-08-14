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

## Parameters recorded with the initial v1 run

This historical section is not the current v2.5.1 configuration; the current
baseline below uses 16 substeps.

- SI units internally; board authoring in millimeters and grams
- Gravity: `9.80665 m/s²`; effective gravity scale: `1.0`
- Physics: `240 Hz` outer tick with four substeps (`960 Hz` effective); CCD enabled
- Ball diameter: `11 mm`; mass: `5.45 g`; solid-sphere inertia
- Ball restitution: `0.44`; friction: `0.12`
- Maximum launch velocity: `5.2 m/s`
- Launch angular jitter: `0.30°`, produced by seeded RNG
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

The recorded START rate is a deterministic tuning result, not a claim about an official
Eva 15 gauge. Exact manufacturer nail coordinates and adjustment data remain
unpublished and are not inferred as measured values.

## Physics integrity rebuild 2.2

Recorded on 2026-08-10 with board `2.2.0-contact-clearance`, physics
`phase1-rapier-0.19.3-v3`, seed `123456`, power `0.68`, 100 balls/min,
240 Hz, two substeps, and CCD enabled.

| Balls | START | OUT | Other terminal | Other sensor events | Timeout | START rate | OUT rate | Avg lifetime | Avg collisions | Avg velocity | Max velocity | Remaining |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 10 | 73 | 17 | 21 | 0 | 10.00% | 73.00% | 1.1193 s | 13.430 | 0.8299 m/s | 3.5360 m/s | 0 |
| 1,000 | 150 | 588 | 262 | 340 | 0 | 15.00% | 58.80% | 1.1315 s | 14.147 | 0.8326 m/s | 3.5360 m/s | 0 |
| 10,000 | 1,516 | 5,777 | 2,707 | 3,605 | 0 | 15.16% | 57.77% | 1.1304 s | 14.166 | 0.8337 m/s | 3.5360 m/s | 0 |

All runs completed with finite values and zero velocity-clamp activations. A reproduced deadlock
between nail `n070` and the lower-left display rail was removed by restoring 12.048 mm of free
width for the 11 mm ball; the former 8.291 mm gap physically trapped it. The unmeasured recovery
impulse and the rule that mislabeled upper-board timeouts as OUT were removed. START and other
terminal entries now freeze the rigid body immediately, preventing one ball from later being
counted again at OUT.

These rates are deterministic simulation baselines, not real-machine calibration. With the same
geometry, effective solver rates of 240, 480, and 960 Hz produced START rates of 27.2%, 15.0%, and
22.4% respectively in 1,000-ball tests. This non-convergence means no START percentage should be
tuned or presented as physically correct until measured trajectories and board coordinates are
available.

The 10,000-ball, 25 mm heatmap produced config hash
`c0bbf954d0fc171c03d6f28a3e06bc82bb6bb92e9312e050f2505ce9eee7b11d` and board hash
`7872a28681772b780bb7221b710f4e97a197bfd3def1d3b9b701dfdb5d0298e0`. Its highest traffic is the
right launch lane and upper-return entry; the highest collision cells are `(325,125)`, `(300,125)`,
and the lower START approach around `(250,400)`. The repaired `(200,300)` cell still carries 3,148
passages but has zero timeout outcomes, so the former stationary trap is no longer hidden there.

## Physical-scale rebuild 2.3

Recorded on 2026-08-10 with board `2.3.0-physical-scale-passive-windmill`, physics
`phase1-rapier-0.19.3-v4`, seed `123456`, power `0.68`, 100 balls/min, 240 Hz with four
substeps, and CCD enabled.

| Balls | START | OUT | Other | Timeout | START rate | OUT rate | Avg lifetime | Avg collisions | Avg velocity | Max velocity | Remaining |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 18 | 14 | 68 | 0 | 18.00% | 14.00% | 1.0094 s | 15.630 | 0.9451 m/s | 3.5360 m/s | 0 |
| 1,000 | 194 | 220 | 586 | 0 | 19.40% | 22.00% | 1.0089 s | 15.139 | 0.9584 m/s | 3.5360 m/s | 0 |
| 10,000 | 2,037 | 2,242 | 5,721 | 0 | 20.37% | 22.42% | 1.0157 s | 15.241 | 0.9546 m/s | 3.5360 m/s | 0 |

Version 2.3 scales Rapier tolerances to the 11 mm ball, uses a 0.92 mm nail radius from
published shaft dimensions, applies solid-sphere rotational inertia, makes windmills passive,
and repairs five reproduced sub-ball clearances. These are physical-model corrections, not
adjustments toward a desired START rate.

The inner launch rail is now bidirectional fixed geometry. The former implementation made the
315 mm rail disappear whenever a ball's vertical velocity changed sign; that was useful for an
old route approximation but is not how a fixed metal rail behaves.

The full-board result remains sensitive to the launch-release / `n019` splitter. With the final
geometry before the rail correction, 1,000 balls at 960 and 1920 Hz produced START rates of
19.0% and 13.7%, while route
rates differed by about two points. Treat 2.3 as a more physically grounded reproducible baseline,
not a measured real-machine match.

## Current deterministic baseline 2.5.1

Generated on 2026-08-11 from board `2.5.1-visible-continuous-gauge`, physics
`phase1-rapier-0.19.3-v5`, seed `123456`, power `0.68`, 100 balls/min, 240 Hz,
16 substeps, and CCD enabled.

| Balls | START | OUT | Other | Timeout | START rate | OUT rate | Avg lifetime | Avg collisions | Avg velocity | Max velocity | Remaining |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 48 | 34 | 18 | 0 | 48.00% | 34.00% | 1.2203 s | 24.330 | 0.9681 m/s | 3.5360 m/s | 0 |
| 1,000 | 437 | 322 | 241 | 0 | 43.70% | 32.20% | 1.1907 s | 24.069 | 0.9847 m/s | 3.5360 m/s | 0 |
| 10,000 | 4,360 | 3,272 | 2,368 | 0 | 43.60% | 32.72% | 1.1940 s | 24.0955 | 0.9827 m/s | 3.5360 m/s | 0 |

The 1,000-ball row is the reproducible baseline captured in `docs/baseline-report.json`,
not a real-machine target. At 32 substeps the same 1,000-ball input produces
START 42.1%, OUT 30.9%, other 27.0%, and 22.349 average collisions. The current
point convergence gate therefore fails.

The larger same-seed 10,000-ball check also remains unresolved: START changes
43.60%→43.11%, OUT 32.72%→29.89%, average lifetime −2.348%, average collision
count −7.603%, and average velocity +2.251%. Both runs remained finite with zero
timeouts, remaining bodies, and velocity-clamp activations. The OUT difference
is outside the 95% diagnostic interval gate; selecting 32 substeps is not a fix.

Equal effective timesteps produce identical results when outer Hz and substeps
are refactored, which rules out the runner/fire schedule as the cause. A minimal
straight-capsule case reproduces integration-resolution-dependent microscopic
separation and re-contact during a grazing bounce. That Rapier contact-path
sensitivity is still open P1 work; it must not be hidden by tuning START rate.

There are currently zero qualifying real-machine videos at 240 fps or faster,
zero ObservedCapture records, and no independent HOLDOUT evaluation. These
simulation numbers are therefore uncalibrated. Browser validation was later
limited to isolated 500×375 background contexts in the dedicated Hermes Chrome
profile; this does not change or validate the physics calibration numbers above.

## Physical START mouth correction 2.6

Generated on 2026-08-12 from board `2.6.0-physical-start-mouth`, physics
`phase1-rapier-0.19.3-v6`, seed `123456`, power `0.68`, 100 balls/min, 240 Hz,
16 substeps, and CCD enabled.

| Balls | START pocket | OUT | Other | Timeout | START rate | OUT rate | Avg lifetime | Avg collisions | Avg velocity | Max velocity | Remaining |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 125 | 8 | 116 | 1 | 0 | 6.40% | 92.80% | 1.5853 s | 30.512 | 0.7989 m/s | 3.5360 m/s | 0 |
| 250 | 16 | 232 | 2 | 0 | 6.40% | 92.80% | 1.5860 s | 30.388 | 0.7991 m/s | 3.5360 m/s | 0 |
| 1,000 | 65 | 931 | 4 | 0 | 6.50% | 93.10% | 1.5868 s | 30.412 | 0.7993 m/s | 3.5360 m/s | 0 |
| 10,000 | 611 | 9,353 | 36 | 0 | 6.11% | 93.53% | 1.5839 s | 30.4798 | 0.8009 m/s | 3.5360 m/s | 0 |

The v2.5.1 rate was invalid: every START ball last touched `n117`, and the ball
edge could trigger the old 1 mm overlap sensor while its centre remained outside
the pocket. Version 2.6 removes START from generic overlap sensing. A START now
requires the ball centre to cross downward through the life-nail shaft gap. The
left guide ends above those nails instead of delivering balls underneath them,
and two left-route nails now intercept the actual trajectory. A 1,000-ball
contact audit consequently reaches 21 named solid colliders instead of seven.

The earlier provisional comparison incorrectly rewrote the user-supplied
`17 rotations / 125 balls` as `17 / (250 + 17) = 6.367%`. That comparison is
invalid and must not be used as a calibration target. Until the denominator and
prize-ball replay rule are specified separately, the literal launch-ball
reference is `17 / 125 = 13.6%`.

Numerical convergence is still open. The same 1,000 inputs at 32 substeps produce
101 START, 869 OUT, and 30 other pockets; average collision count falls from
30.412 to 28.255. This fails the 0.3 percentage-point rate and 2% mean gates.
Changing only the outer-tick partition while preserving the effective step
(`120×32`, `240×16`, `480×8`) remains exactly invariant, confirming that the
difference comes from contact-resolution refinement rather than scheduling.

The 10 mm heatmap has its highest field traffic around `(50,180)` and highest
collision concentrations around `(50,190)`, the display top, and the lower
approach `(220–230,420–440)`. The board now uses multiple left-route nails, but
99.64% of balls still reach the centre-route sensor, so route diversity and the
unused passive windmill remain uncalibrated. No velocity clamp fired; there were
zero timeouts and zero remaining bodies.

## Left-launch structural correction 2.7

Version `2.7.0-left-launch` moves the launcher and its rail to the lower-left and
releases the ball from the upper-left, matching the physical launch side of a
standard Japanese pachinko machine. This is a structural correction, not a
START-rate calibration.

With seed `123456`, power `0.68`, and 1,000 balls, the corrected route records
19 START, 980 OUT, one other pocket, zero timeouts, and zero remaining bodies.
The 1.9% START rate is well below the literal `17 / 125 = 13.6%` reference and
must not be presented as calibrated. Across ten earlier fixed-seed 125-ball
runs, the right-launch board averaged only 7.7 START per 125 balls; the former
documentation masked that shortfall by changing the denominator.

Completion now requires measured launcher-exit trajectories, board coordinates,
and complete START/OUT records in independent TRAIN and HOLDOUT captures. Nail,
friction, restitution, or mouth geometry must not be adjusted solely to force
the 13.6% aggregate.

## Upper-release correction 2.8

The first left-launch version still reflected every normal shot at about
`y=125 mm`: none of 1,000 balls touched the outer playfield rail or top ten
nails. Version `2.8.0-upper-release` changes only the end point of that release
rail from `(80,70)` to `(55,57)`. At the same seed and power, 901/1,000 balls
touch the outer rail and 810/1,000 touch at least one top nail; timeout and
remaining-body counts stay zero. START changes from 1.9% to 1.6%, so this is an
upper-route reachability repair, not target-rate tuning.

The audit also confirms that both windmill swept envelopes penetrate the filled
LCD collider by about 2.05 mm and that the lower START route still depends on
the long left bowl and OUT guide. Those geometries remain uncalibrated and are
not hidden by changing the START mouth.

The production board already produces visible nail reflection: the fixed
single-ball route changes direction by more than 30 degrees at its first nail
(about 66 degrees in the current trace). A regression test now requires that
direction change; restitution was not increased to manufacture a higher START
rate.

Solver refinement remains unresolved. At 1,000 balls, 16→32 substeps changes
START 1.6%→6.3% and OUT 92.9%→78.7%. Solver iterations, CCD substeps, contact
skin, and a one-collider release/outer-rail prototype did not remove the
divergence. Equal effective timesteps remain exactly deterministic, so
`240 Hz × 16 substeps` is pinned as this model version's reproducibility
condition; it is not evidence of numerical convergence or real-machine
calibration.

Fixed-seed validation at `240 Hz × 16 substeps`:

| Balls | START | OUT | Other | START rate | OUT rate | Avg lifetime | Avg collisions | Max velocity | Timeout | Remaining |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 2 | 95 | 3 | 2.00% | 95.00% | 1.7291 s | 37.6500 | 3.5360 m/s | 0 | 0 |
| 1,000 | 16 | 929 | 55 | 1.60% | 92.90% | 1.6776 s | 36.2820 | 3.5360 m/s | 0 | 0 |
| 10,000 | 176 | 9,089 | 735 | 1.76% | 90.89% | 1.6530 s | 35.7087 | 3.5360 m/s | 0 | 0 |

The physical rate is explicitly `START pocket entries / launched balls`.
Aggregate observed-data schema v2 requires
`ballCountBasis: "LAUNCHED_BALLS"`; loaned-ball and prize-replay figures cannot
enter the physics calibration until an economy ledger exists.

## Provisional nail pass 2.9

The v2.8 lower-path audit traced 2,500 balls across five fixed seeds. All 26
START balls touched `n109` and then `n117`; `n110` contact led to zero START in
637 cases. This identifies the simulated branching mechanism, but it is not
evidence that the unmeasured geometry matches an Eva 15 machine.

The smallest retained changes are `n117` x +0.5 mm and the two life nails 0.6
mm outward per side. The START mouth is derived from their shaft opening and
therefore changes from 11.86 to 13.06 mm. Same-seed comparison:

| Variant | Balls | START | OUT | Other | START rate | Avg lifetime | Avg collisions | Max velocity | Timeout | Remaining |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| v2.8 unchanged | 5,000 | 68 | 4,559 | 373 | 1.36% | 1.6510 s | 35.5528 | 3.5360 m/s | 0 | 0 |
| v2.9 candidate | 5,000 | 692 | 3,935 | 373 | 13.84% | 1.6620 s | 35.9362 | 3.5360 m/s | 0 | 0 |

The candidate converts 624 outcomes from OUT to START while other pockets,
timeouts, body cleanup, and maximum velocity remain unchanged. Enabled-nail
surface clearance is at least 11.761 mm for an 11 mm ball. This is a provisional
regression baseline around the literal `17 / 125` reference, not real-machine
calibration. Independent measured trajectories and launcher/geometry data are
still required before more nail movement is defensible.

The five tuning seeds were then frozen. Five previously unused HOLDOUT seeds
produced 687/5,000 START (13.74%), 3,959 OUT (79.18%), 354 other pockets
(7.08%), zero timeout, and zero remaining bodies. A separate seed `123456`
10,000-ball run produced 1,368 START (13.68%), 7,901 OUT (79.01%), 731 other
pockets (7.31%), 1.6637 s mean lifetime, 36.0931 mean collisions, 3.536 m/s
maximum velocity, zero timeout, and zero remaining bodies. A 100-ball run at
the same fixed seed produced 12 START (12%), 85 OUT, three other pockets,
1.7374 s mean lifetime, and 38.21 mean collisions.

Numerical refinement is still a hard limitation: seed `123456`, 1,000 balls,
changes from 125 START (12.5%) at 16 substeps to 255 START (25.5%) at 32
substeps. The v2.9 numbers are reproducible only under the pinned 240 Hz × 16
configuration; this failure prevents calling the model converged.

## Hanemono activation 2.10.3

Three oscillating kinematic wings are enabled at x=70/430, y=338 and x=350,
y=418 mm. Each blade is 12 mm wide, 2 mm thick, and oscillates ±8° at 1 Hz.
A 1,000-ball fixed-seed run completed with timeout=0 and remainingBodies=0;
the wings share the Rapier/Pixi transform path.

## Hanemono START-rate calibration 2.10.4

The left wing was the measured source of the 2.10.3 START-rate increase: a
500-ball ablation changed 11.4% with no wings to 19.0% with only the left wing,
while the right and bottom wings were neutral. Moving only the left-wing pivot
from y=338 to y=344.5 mm retained all three active wings. Five calibration
seeds produced 685/5,000 START (13.70%); five separate HOLDOUT seeds produced
728/5,000 (14.56%). Both pass the explicit `17 / 125 = 13.6%` target with a
±1.0 percentage-point gate. All ten runs had timeout=0 and remainingBodies=0.

## Hanemono set 2.10.1

Three oscillating kinematic wing definitions were added at pivots `(70,350)`,
`(430,350)`, and `(350,430)` mm. The right wing is enabled; the left and bottom
variants remain disabled because 100-ball probes produced timeout bodies in the
normal route. All definitions use shared Rapier/Pixi transforms and can be
enabled only after a route-specific clearance test passes.
