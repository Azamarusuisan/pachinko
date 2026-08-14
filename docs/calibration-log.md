# Prototype Calibration Log

All values below are reference-based approximation parameters, not measured Eva 15 dimensions.

## 2026-08-08 — v1.0.1

Fixed scenario: seed 123456, 100 balls, power 0.68, 100 balls/min, 240 Hz, CCD ON.

- Raised the launch-inner opening from y=58 mm to y=130 mm. Trace evidence showed the ball reached the top deflector but was reflected back into the launch lane by the former rail endpoint. The new opening lets the physical rebound enter the board.
- Kept the shallower top deflector after a steeper trial reduced nail contacts and sent balls directly toward OUT.
- Moved route sensors to y=400 mm and constrained the right sensor to x≤447 mm, excluding the ascending launcher lane from route classification.
- Reduced side pocket sensors from 24×18 mm in the main flow to 14×10 mm at x=90/410 mm. The former geometry produced 72% other-pocket entries and did not represent a small side pocket.
- Compared gravityScale 0.62; rejected it because the ball arrived at the top deflector faster, skipped nail rows after rebound, and shortened lifetime.
- Compared max launch velocity 5.0, 5.2, and 5.8 m/s. At the fixed power, 5.2 m/s gave the best tested balance: 11% START, 82% OUT, 7% other pocket, 0 timeouts, 0.666 s average lifetime, 6.47 average collisions, and 3/20/77% left/center/right route distribution in the 100-ball probe.

The 100-ball figures are calibration probes, not claimed real-machine probabilities. The 1000/10,000-ball acceptance outputs supersede them for regression reporting.

## 2026-08-10 — v2.3 physical-scale rebuild

- Set Rapier `lengthUnit` to the 11 mm ball diameter. The former 1 m default allowed about
  1 mm penetration, which is too coarse for 1.8–1.9 mm nail shafts.
- Changed prototype nail radius from 1.2–1.25 mm to the published shaft-scale 0.92 mm.
- Changed ball mass to the industry-typical 5.45 g and used solid-sphere inertia `2/5 mr²`.
- Replaced continuously driven windmills with passive 5 g dynamic rotors. Mass and damping
  remain calibration hypotheses until a target machine is measured.
- Made the full inner launch rail bidirectional fixed geometry instead of disabling its collision
  whenever a ball started descending.
- Repaired reproduced fixed-geometry traps at n004, n050, n059, n070, and n109/n110 using
  ball-diameter clearance checks; no recovery force or timeout reclassification is used.
- Selected a provisional 1/960 s Rapier step because the primary n019 collision was locally
  close to the 1/1920 s result. Full-board route and terminal distributions are not yet converged,
  so this is a regression baseline rather than a real-machine calibration.

## 2026-08-12 — v2.9 provisional nail pass

Fixed comparison: seeds `1`, `7`, `21`, `123456`, and `987654321`; 1,000 balls
per seed; power `0.68`; 100 balls/min; 240 Hz; 16 substeps; CCD enabled.

- A path audit found that every one of 26 START balls in a 2,500-ball trace last
  touched `n117`, while `n110` rejected all 637 balls that touched it. The
  dominant lower path was `n109 -> n117`; this is measured simulation behavior,
  not an assumed nail role.
- One-variable tests moved only `n117` right by 0.5 mm and increased START from
  1.36% to 9.30% across the five fixed seeds. Moving the life nails alone by
  0.6 mm per side produced 2.72% in the 625-ball screen.
- The retained combination moves `n117` from x=235.0 to 235.5 mm, `n110` from
  x=243.15 to 242.55 mm, and `n111` from x=256.85 to 257.45 mm. The START mouth
  follows the physical shaft opening from 11.86 to 13.06 mm.
- The retained candidate produced 692/5,000 START (13.84%), 3,935 OUT (78.70%),
  373 other pockets (7.46%), zero timeout, zero remaining bodies, 1.6620 s mean
  lifetime, 35.9362 mean collisions, and 3.536 m/s maximum velocity. The global
  minimum enabled nail-to-nail surface clearance remained 11.761 mm, above the
  11 mm ball diameter.
- This version is deliberately named provisional. The 13.6% reference is a
  user-supplied launch-ball aggregate, not a measured Eva 15 geometry or a
  holdout trajectory dataset. Sub-millimetre ablations were non-monotonic, so
  no further rate-only tuning is justified without observed machine data.
