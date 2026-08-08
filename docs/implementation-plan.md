# Phase 1 Completion Plan

This is the authoritative path from the current scaffold to a verified Phase 1. A green-looking UI is not completion; every gate below requires direct evidence.

## Current baseline

Implemented source exists for the workspace, board schema/SI conversion, typed events, Rapier engine, fixed accumulator, seeded launcher variation, replay log shape, headless runner, prototype JSON, React/Pixi simulator, debug/calibration controls, editor UI, effect/audio/economy boundaries, Vitest suites, and Playwright scenarios.

The package installation and all runtime evidence are currently unavailable because the execution environment cannot resolve `registry.npmjs.org`. No Golden values or simulation statistics may be invented while this remains true.

## Stage A — Complete the compile-time shape

1. Keep package dependency direction aligned with `architecture.md`.
2. Make board editing a pure validated API: select/move/add/delete/load/save operations must not depend on React or Rapier.
3. Define calibration scenarios, parameter patches, run identity, and before/after metric comparison outside the UI.
4. Define replay compatibility checks using board version, physics version, seed, and ordered tick inputs.
5. Complete effect/audio/mechanism/economy interfaces without enabling excluded Phase 2 behavior.
6. Add API-level tests for event ordering, editor operations, calibration comparison, and replay compatibility.
7. Maintain a requirement/evidence matrix in `phase1-status.md`.

Exit evidence: source/API review finds a named owner and test location for every Phase 1 concept. Runtime-dependent gates may remain `BLOCKED`, never `PASS`.

## Stage B — Restore a reproducible toolchain

1. Run `npm install` from the repository root and retain `package-lock.json`.
2. Run `npm run typecheck`; fix actual Rapier/Pixi/Zod/React API mismatches without weakening strictness.
3. Run `npm run lint`; resolve findings rather than blanket-disabling rules.
4. Run focused schema/event/editor/calibration tests, then physics tests.
5. Run `npm run build` and a bounded `npm run dev` smoke test.

Exit evidence: install, typecheck, lint, unit tests, build, and dev-server startup all return zero using the lockfile.

## Stage C — Establish physics correctness

1. Verify gravity analytically within tolerance at 120/240/480 Hz.
2. Verify nail collision events and post-contact reflection using actual velocity/contact data.
3. Tune a high-speed case where CCD OFF tunnels and CCD ON records contact/reflection.
4. Verify rail traversal, START exactly-once entry, OUT, lifecycle, and actual Rapier body removal.
5. Replay identical inputs twice and compare events, completions, and metrics.
6. Feed 30/60 fps accumulator schedules, desktop/mobile viewport metadata, and 1x/16x wall-clock schedules; compare physics results.

Exit evidence: all mandatory focused physics tests pass and their assertions inspect results, not just flags.

## Stage D — Calibrate the prototype flow

1. Run small trajectory probes and visually inspect launcher rail ascent and top deflection.
2. Adjust only JSON calibration parameters; record every change and rationale.
3. Confirm balls enter the board and encounter multiple nail rows without hidden forces.
4. Ensure START, OUT, and other pockets all have physically reachable paths.
5. Run 100-ball probes over several seeds to detect stuck balls, route misclassification, or pathological pileups.
6. Compare 120/240/480 Hz; keep 240 Hz default and document material differences.

Exit evidence: saved prototype JSON, captured debug screenshots/traces, finite runs, and an explicit approximation disclaimer. Statistical tuning must not be described as real-machine measurement.

## Stage E — Batch and Golden verification

1. Run 100 balls and inspect event/terminal totals.
2. Run the fixed 1000-ball Golden scenario: board v1, seed 123456, power 0.68, 100 balls/min, 240 Hz, CCD ON.
3. Generate the first baseline from that actual output with `npm run golden:update`.
4. Enable a regression test that loads the committed baseline and applies documented tolerances.
5. Run 1000 balls again to prove determinism.
6. Run 10,000 balls and record wall time, all metrics, finite status, timeouts, and remaining Rapier bodies.

Exit evidence: raw JSON outputs plus passing Golden regression. A high timeout rate is a calibration failure, not a successful completion merely because the runner terminated.

## Stage F — Browser and responsive verification

1. Run Playwright Chromium desktop, WebKit desktop, iPhone WebKit, and Android Chromium projects.
2. Verify canvas initialization, power control, manual fire, Space hold, auto-fire toggle, realistic preset, speed/CCD controls, debug overlays, calibration changes, editor operations, JSON load/save, and worker batch buttons.
3. Check resize/device-pixel-ratio changes do not recreate or alter physics outcomes.
4. Perform manual macOS Safari and Chrome checks; report any browser not manually checked as unverified.

Exit evidence: Playwright report and manual checklist with browser versions.

## Stage G — Final audit and handoff

Audit every row in `phase1-status.md`. Re-run install/test/typecheck/lint/build after final changes, then re-run 1000/10,000-ball commands if physics-affecting code or board JSON changed. Report implementation, structure, commands, exact test results, both batch results, SI parameters, Golden tolerances, known issues, determinism limits, and Phase 2 candidates.

Phase 1 may be declared complete only when every required row is `PASS` with linked command/file evidence. `BLOCKED`, `UNVERIFIED`, or indirect evidence prevents completion.
