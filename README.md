# Pachinko Simulation Platform

The current playable prototype combines a deterministic Rapier pachinko board
with an original six-second robot-anime lottery story. The story is rendered as
96 local JPEG frames at 16 fps; it uses no background music and synchronizes
procedural launch, impact, lock-on, silence, confirmation, and RUSH sound effects.
Normal play launches left at calibrated power, while a jackpot switches the same
launcher to the dedicated right-side RUSH route for 100 shots.

Physics-first browser pachinko simulation using TypeScript, Rapier 2D WASM, React, and PixiJS.

The prototype board is a reference-based approximation and does not reproduce official artwork or claim measured nail positions.

```bash
npm install
npm run dev
npm test
npm run build
```

Open `http://localhost:5173` after `npm run dev`. The production UI includes the
live Pixi board, launcher controls, automatic firing, debug/calibration panels,
board editor, and headless batch controls. On a phone-sized viewport the side
panel is available from the drawer button.

Full automated verification:

```bash
npm run verify:phase1
npx playwright install chromium webkit
npm run test:e2e
```

Measured batch and calibration evidence is recorded in
`docs/simulation-results.md` and `docs/phase1-status.md`.

See `docs/` for architecture, physics, board format, testing, and future effect-system decisions.

## Dependency-free UI preview

When npm dependencies are unavailable, open `ui-preview.html` directly in a local browser. It represents the responsive Phase 1 layout but deliberately runs no ball animation or physics.
