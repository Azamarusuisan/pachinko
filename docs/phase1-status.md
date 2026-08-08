# Phase 1 Requirement Evidence

Status meanings: `PASS` = direct evidence exists, `IMPLEMENTED-UNVERIFIED` = source exists but has not run, `BLOCKED` = external state prevents evidence, `MISSING` = work remains.

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
| Manual, Space-hold, and auto fire | IMPLEMENTED-UNVERIFIED | Browser/E2E evidence |
| REALISTIC 100 balls/min independent of speed | PASS | Input and speed-isolation tests |
| Pixi rendering and responsive mobile drawer | IMPLEMENTED-UNVERIFIED | Build plus four Playwright projects |
| All debug toggles including contact point/normal | IMPLEMENTED-UNVERIFIED | Rapier contact data rendered in browser |
| Calibration before/after comparison | PASS | Calibration comparison test; worker UI awaits manual check |
| Simple validated Board Editor | PASS | Pure editor and Board JSON validation tests; browser interaction awaits manual check |
| Effect/audio registries and lazy-load interfaces | PASS | Manifest tests and typecheck |
| 3D mechanism boundary only | PASS | Typecheck; no Three/GLB runtime in Phase 1 |
| Integer append-only economy boundary; redemption disabled | PASS | Economy tests |
| 100-ball run | PASS | Complete finite run; zero remaining bodies |
| 1000-ball run | PASS | Complete finite run; zero remaining bodies |
| 10,000-ball run | PASS | v2 complete finite run in 22.01 seconds; zero timeout and remaining bodies |
| Golden regression | PASS | Separate v1/v2 baselines; v2 seed 123456 comparison test |
| `npm install` | PASS | User command exit 0; lockfile updated offline; audit currently reports zero vulnerabilities |
| `npm test` | PASS | 13 files and 26 tests pass |
| `npm run build` | PASS | TypeScript project build and Vite production build exit 0 |
| lint/typecheck | PASS | Both commands exit 0 |
| PC Safari/Chrome manual validation | BLOCKED | Manual test record with versions |

This table must be updated from command output, never from intent or the presence of source files alone.

Research-rebuild v2 evidence is recorded in `docs/simulation-results.md`.

Right-play rebuild 2.1 adds a shared-launcher physical split, dedicated right
route sensors, a deterministic visual GLB, and separate 10,000-ball evidence for
left and right handle settings.
