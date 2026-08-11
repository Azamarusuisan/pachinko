# Simulation convergence gate

This gate reruns the same board, seed, ball count, launch power, physics Hz, and CCD setting at two effective solver resolutions:

- baseline: the board's configured `substeps`
- refined: `min(32, baseline substeps × 2)`

It does not tune the board or define a real-machine target. It only checks whether the current numerical result is stable when the solver step is refined.

## Project gates

The comparison passes only when both runs are finite and all of these conditions hold:

- absolute START-rate delta ≤ 0.3 percentage points
- absolute OUT-rate delta ≤ 0.3 percentage points
- absolute relative delta of mean lifetime ≤ 2%
- absolute relative delta of mean collision count ≤ 2%
- absolute relative delta of mean velocity ≤ 2%
- timeout rate in each run < 0.01%
- remaining bodies in each run = 0
- velocity-clamp activations in each run = 0

Maximum-velocity delta is reported in metres per second but is not assigned an arbitrary pass threshold. A zero baseline with a nonzero refined mean produces a non-comparable relative delta and fails that mean's gate.

Run the default 100-ball developer check:

```sh
npm run simulate:convergence
```

Choose a deterministic sample:

```sh
npm run simulate:convergence -- --balls 1000 --seed 123456 --power 0.68
```

The command exits nonzero when the gate fails. At `substeps: 32`, refinement is capped and `resolutionChanged` is false; that result is reported explicitly and should not be treated as evidence from a finer step.

## Point gate versus statistical evidence

The START/OUT checks above remain deterministic regression gates and continue to control `pass` and the CLI exit code. They are not, by themselves, a statistical equivalence test. In particular, a 0.3 percentage-point tolerance is much narrower than the sampling error of two 1,000-ball rates near 40%.

Each result therefore also reports `rateUncertainty` using an unpooled two-proportion normal 95% confidence interval. Its classification is diagnostic and never overrides the point gate:

- `CONFIRMED_WITHIN_GATE`: the complete 95% interval lies inside ±0.3 percentage points.
- `CONFIRMED_OUTSIDE_GATE`: the complete interval lies outside the permitted band on one side.
- `INCONCLUSIVE`: the interval overlaps the band boundary, or the normal approximation lacks at least 10 expected successes and failures in either sample.

At the worst-case rate of 50%, about 213,415 balls **per solver resolution** are needed merely to make the two-sample 95% interval half-width 0.3 percentage points when the observed delta is zero. A result close to the boundary requires more. Use more balls and multiple fixed seeds for a release decision; do not tune physics to make a 1,000-ball point estimate pass.

## Confirmed 16→32-substep investigation (seed 123456)

These are measurements of board version `2.5.1-visible-continuous-gauge`, physics 240 Hz, launch power 0.68. No material value was changed while collecting them.

### Confirmed facts

- The 1,000-ball point gate still fails: START 43.7%→42.1% (−1.6 points), OUT 32.2%→30.9% (−1.3 points), and average collision count 24.069→22.349 (−7.146%). Timeout, remaining-body, clamp, finiteness, mean-lifetime, and mean-velocity checks pass.
- The corresponding 95% intervals are START −5.938 to +2.738 points and OUT −5.373 to +2.773 points. Both rate classifications are `INCONCLUSIVE`; 1,000 balls do not establish either equivalence or a systematic rate regression.
- At 10,000 balls with the same seed, START is 43.60%→43.11% (−0.49 points; 95% interval −1.864 to +0.884, `INCONCLUSIVE`) while OUT is 32.72%→29.89% (−2.83 points; interval −4.115 to −1.545, `CONFIRMED_OUTSIDE_GATE`). Mean lifetime changes −2.348%, collision count −7.603%, and mean velocity +2.251%. Safety checks still pass: zero timeouts, remaining bodies, and clamp activations, with finite values throughout.
- A five-seed aggregate (seeds 1, 7, 21, 123456, and 987654321; 1,000 balls per seed and resolution) independently gives START 43.38%→42.96% (−0.42 points; interval −2.362 to +1.522, `INCONCLUSIVE`) and OUT 32.88%→30.12% (−2.76 points; interval −4.580 to −0.940, `CONFIRMED_OUTSIDE_GATE`). Its mean collision-count delta is −7.486%. Individual START deltas range from −3.0 to +1.5 points, while collision deltas remain −7.15% to −7.83%; this separates seed-sensitive terminal sampling from the repeatable contact-count bias.
- Refining once more from an effective 7,680 Hz (240×32) to 15,360 Hz (480×32) does **not** justify selecting 32 substeps as a fix. In a 1,000-ball seed-123456 diagnostic, START changes 42.1%→30.3% (−11.8 points; interval −15.98 to −7.62, `CONFIRMED_OUTSIDE_GATE`), OUT 30.9%→28.3%, other pockets 27.0%→41.4%, and collision count 22.349→20.721 (−7.284%). This board is not numerically converged at the current resolutions.
- Re-factorizations with the same effective solver step are identical: 120 Hz×32 substeps, 240 Hz×16, and 480 Hz×8 produce the same terminal rates, collision mean, and velocity mean. Likewise, 240×32 equals 480×16. The runner's outer tick, fire schedule, and substep loop are therefore not the source of the difference.
- A one-ball launcher micro-board reaches `launch-inner-one-way` and then `launch-release` in the same order at 16 and 32 substeps. At release, its ball-position delta is 0.678 mm, contact-point delta about 0.476 mm, contact-normal delta about 0.00000072, and post-contact velocity-vector delta about 0.00227 m/s. This is covered by a regression test.
- The full-board `ball-1` trace also matches through launcher release and its first two center-display contacts. At 16 substeps the display produces an additional contact start at outer tick 93; at 32 it does not, and the paths are thereafter phase-shifted. Both still enter ROUTE_LEFT then ROUTE_CENTER and hit `n110` and `n117`. At 16, a second `n117` contact turns the ball into START; at 32 that re-contact is absent and the ball enters OUT. This trace never touches `n019`, and with one ball there is no ball-ball contact. Thus neither `n019` nor ball-ball collision explains this reproduced terminal change.
- The center display is already built as one `roundConvexPolyline` collider (`center-display-collider/outline`), not nine overlapping capsules. A display-only micro-board—launcher rails, launcher gate, one ball, and that collider; no nails, arcs, sensors, or second ball—reproduces all seven 16-substep display contact starts at ticks 48, 65, 71, 73, 89, 92, and 93 versus six at 32 substeps (48, 65, 70, 72, 89, 92).
- A still smaller board with one straight capsule rail and no segment joint also reproduces the phenomenon: contact-start ticks are 12, 18, 20 at 16 substeps versus 12, 18 at 32. The first contact remains locally convergent (position delta 0.095 mm, point delta 0.0041 mm, normal delta below 0.000001, post-contact velocity delta below 0.000005 m/s). This rules out connected-segment overlap and display corners as necessary causes. The differing count comes from integration-resolution-dependent microscopic separation and re-contact during a grazing bounce.
- A one-variable 200-ball ablation changing only the display adapter back to nine separate capsule colliders is dramatically worse: START changes 58.0%→9.5%, OUT 41.5%→50.5%, and other pockets 0.5%→40.0% between 16 and 32 substeps. The current single collider changes those same rates 44.5%→40.0%, 32.5%→30.5%, and 23.0%→29.5%. Keeping the already-implemented single continuous collider is therefore justified; reverting to joined capsules is not a candidate fix.
- On the full board, that small phase difference reaches the center-display/outer-playfield corridor and grows through repeated contacts. Only 4 of 1,000 complete collider-event sequences remain identical. The most frequent first differing collider pairs are center display↔outer playfield (598 balls in both directions combined) and outer playfield↔left out guide (318 balls). The first differing event was not a ball-ball collision.
- Ball spacing is not causal in this sample: fire rates 25 and 100 produce exactly the same metrics at each solver resolution.
- In a 200-ball diagnostic ablation, removing the center-display collider reduces the START delta from 4.5 points (44.5%→40.0%) to 0.5 points (34.0%→33.5%) and cuts the collision-count delta from 7.62% to 2.15%. It also changes the physical board route drastically, so that collider was **not** removed from production.
- Swept sensor checks, gravity splitting, CCD toggles, solver-iteration changes, material sweeps, alternate display shapes, and state quantisation either had no effect or changed gameplay substantially. None was retained.

### Interpretation, not yet a calibrated real-machine fact

The dominant mechanism is deterministic chaotic amplification: sub-millimetre integration differences at launcher release and early contacts change the phase of repeated collisions around the central display, then decorrelate downstream routes. This explains why individual same-seed balls frequently change terminals. The 1,000-ball START delta remains statistically inconclusive. The 10,000-ball and five-seed aggregates confirm the OUT-rate difference at these two resolutions, while the five-seed collision-count range confirms a repeatable step-sensitive event-count bias.

This analysis establishes numerical sensitivity, not real-machine accuracy. Real trajectory/velocity/contact/dwell observations are still required for calibration, and no solver or material parameter should be selected merely to satisfy this gate.
