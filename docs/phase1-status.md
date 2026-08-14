# Phase 1 Requirement Evidence

Status meanings: `PASS` = direct evidence exists, `IMPLEMENTED-UNVERIFIED` = source exists but has not run, `NOT-RUN` = the current worktree has not been exercised by that command, `BLOCKED` = external state prevents evidence, `MISSING` = work remains.

| Requirement | Status | Authoritative evidence needed |
|---|---|---|
| Architecture and five required docs | PASS | Files under `docs/` reviewed against CODEX.md |
| TypeScript strict monorepo skeleton | PASS | `npm run typecheck` exit 0 |
| Zod Board JSON validation and SI conversion | PASS | Board-schema tests pass against prototype JSON |
| Physics Core has no UI/media/economy dependency | PASS | Package imports/dependency manifest inspection |
| Ball/Nail/Rail/Wall/Pocket/Sensor/Launcher/Gate/MechanismCollider abstractions | PASS | Typecheck and focused construction tests |
| Fixed 120/240/480 Hz stepping and interpolation | PASS | Accumulator/clock-isolation tests |
| CCD ON prevents a demonstrated OFF tunnelling case | PASS | Rapier CCD trajectory test passes |
| Configurable gravity and full calibration parameters | PASS | Calibration API/comparison tests; browser controls await manual check |
| Seeded determinism and input replay | PASS | Equal replay event/completion digests |
| Typed required physics events | PASS | Event-system and sensor/collision tests |
| No hidden attraction/trajectory correction | PASS | Physics-core source audit; no position mutation after spawn |
| Manual, Space-hold, and auto fire | IMPLEMENTED-UNVERIFIED | Source and scenarios exist; the small-window harness currently covers lottery presentation rather than these controls |
| REALISTIC 100 balls/min independent of speed | PASS | Input and speed-isolation tests |
| Pixi rendering and responsive mobile drawer | IMPLEMENTED-UNVERIFIED | Pixi initializes in the Hermes lottery harness; the responsive drawer scenarios were not rerun |
| All debug toggles including contact point/normal | IMPLEMENTED-UNVERIFIED | Rapier contact data rendered in browser |
| Calibration before/after comparison | PASS | Calibration comparison test; worker UI awaits manual check |
| Simple validated Board Editor | PASS | Pure editor and Board JSON validation tests; browser interaction awaits manual check |
| Effect/audio registries and lazy-load interfaces | PASS | Manifest tests and typecheck |
| 3D mechanism boundary only | PASS | Typecheck; no Three/GLB runtime in Phase 1 |
| Integer append-only economy boundary; redemption disabled | PASS | Economy tests |
| 100-ball run | PASS | Current v2.5.1 CLI: finite, zero timeout and remaining bodies |
| 1000-ball run | PASS | Current v2.5.1 baseline: finite, zero timeout and remaining bodies; this is deterministic regression evidence, not real-machine calibration |
| 10,000-ball run | PASS | Current v2.5.1 16/32-substep investigation completed with finite values and zero timeout, remaining bodies, and clamp activations; the convergence gate still fails |
| Golden regression | PASS | Baseline and Golden comparison tests are included in the passing full suite; `baseline:check` records final report drift separately |
| `npm install` | PASS | User command exit 0; lockfile updated offline; audit currently reports zero vulnerabilities |
| `npm test` | PASS | Current CLI run: 27 files and 151 tests pass |
| `npm run build` | PASS | TypeScript project build and Vite production build exit 0; Vite reports only the non-fatal large-chunk warning |
| lint/typecheck | PASS | Both commands exit 0 |
| PC Safari/Chrome validation | IMPLEMENTED-UNVERIFIED | Dedicated Hermes Chrome ran at 500×375 in the background; Safari/WebKit and the full Playwright project matrix were not rerun |

This table must be updated from command output, never from intent or the presence of source files alone.

Research-rebuild v2 evidence is recorded in `docs/simulation-results.md`.

Right-play rebuild 2.1 adds a shared-launcher physical split, dedicated right
route sensors, a deterministic visual GLB, and separate 10,000-ball evidence for
left and right handle settings.

Browser scenarios remain in the repository. After the user allowed a tiny test
window, `test:hermes-small` connected only to the dedicated Hermes profile,
created isolated 500×375 contexts in the background, took no screenshots, and
returned the context count to its original value. Both miss and jackpot have
passing runs, but the gate is not stable: one cold jackpot run recorded a
366.7 ms frame gap and two dropped frames, and a later miss run recorded 58.2 ms
semantic skew against the 50 ms limit. Full browser E2E remains pending.

The current release-asset CLI gate passes for three runtime assets. Nojiru is
clean at `HEAD = origin/main = bbefab094522f17c85342f2fe4822f7e881292eb`.
There are zero qualifying real-machine 240 fps captures, zero ObservedCapture
records, and no independent HOLDOUT evaluation, so real-machine calibration is
blocked. The remaining physics blocker is the unresolved Rapier grazing
separation/re-contact timestep sensitivity described in
`docs/simulation-convergence.md`.

Blender runs headless with `--factory-startup`; without that flag it aborts
during Metal initialization on this machine. Two GLBs are kept on purpose:
`eva15_reference_cabinet.glb` is the deterministic dependency-free export that
carries the provenance extras asserted by tests, and
`eva15_reference_cabinet_blender.glb` is the higher-detail Blender export. The
Blender preview render is a dimensional reference only; the shipped cabinet
visual remains the authored artwork.
