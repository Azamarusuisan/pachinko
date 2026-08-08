# Testing Strategy

## Layers

- Schema tests reject invalid dimensions/materials/IDs and prove mm/g conversion.
- Focused Rapier tests cover gravity, nail contact/reflection, CCD on/off, rails, sensors, lifecycle, and body cleanup.
- Determinism tests compare complete metrics/event digests under equal seed/input.
- Clock isolation tests feed different render frame rates, viewport sizes, and simulation-speed chunking into the same fixed-step schedule.
- Batch tests run 1000 balls without rendering and assert finite state, completion, and no leaked dynamic bodies.
- Golden regression compares the fixed 1000-ball scenario with a measured baseline and documented tolerance.
- Playwright checks responsive controls and a running canvas in Chromium/WebKit/mobile viewports. Manual Safari/Chrome checks remain separately reported.

## Golden policy

The baseline is generated only after the prototype runner completes. It records board version, seed, ball count, power, physics/Rapier versions, and required metrics. Tolerances are narrow enough to catch meaningful drift but avoid pretending statistical aggregates are exact physical measurements. Updating it requires an explained physics/config change and before/after results.

## Batch completion

Batch tests count launched balls, terminal classifications, lifetime, collision count, and first board route. Every ball must finish or hit the configured maximum lifetime; all numbers must remain finite and no destroyed rigid body may remain. 10,000-ball verification is a release/acceptance command rather than a routine unit test if runtime is material.

## Browser claims

Automated Playwright WebKit is supporting evidence, not proof of manual macOS Safari behavior. Final reporting explicitly distinguishes automated browser runs, dev-server smoke tests, and manual checks that were not possible in the execution environment.
