# Observed calibration dataset v1

`parseObservedCapture` is the trust boundary for frame-level annotations from a real-machine video. `summarizeObservedCapture` converts a valid capture into the existing aggregate `ObservedDataset`; it does not invent missing measurements, estimate a homography, choose target values, or optimize physics parameters.

Validate one capture:

```bash
npm run calibration:observed -- --capture research-data/calibration/capture.json
```

Validate an independent pair before calibration:

```bash
npm run calibration:observed -- --train research-data/calibration/train.json --holdout research-data/calibration/holdout.json
```

Raw recordings and annotations remain under the gitignored `research-data/` tree.

## Frame-level capture

Each capture requires the aggregate provenance fields below plus:

- `captureId` and `captureSessionId`; TRAIN and HOLDOUT must use different sessions and source hashes.
- `frameRateHz`, source frame dimensions, and the literal coordinate system `board-mm-top-left-y-down`.
- At least four pixel→board-mm control points and measured median/p95 reprojection error.
- At least one uniquely identified ball with strictly ordered frame/time samples.
- Every annotated collision records collider role/id, board-mm position, and pre/post velocity in m/s.
- Optional first route and terminal records use explicit roles. Missing terminal data stays missing rather than becoming OUT or zero lifetime.

The validator rejects duplicate ball IDs, backwards tracks, collisions outside a ball lifetime, terminal events before the final sample, p95 error below median, same-file TRAIN/HOLDOUT, and same-session TRAIN/HOLDOUT.

`frameRateHz` must be at least 240. This is a project evidence gate, not a claim that 240 fps resolves every impact. Full-board trajectories use 240 fps or faster; isolated nail/rail impacts should be captured separately at 1,000 fps or faster.

## Required capture fields

- `schemaVersion`: currently `"1"`.
- `datasetId`: stable unique slug for the capture.
- `split`: `TRAIN` or `HOLDOUT`.
- `capturedAt`: ISO 8601 timestamp including a timezone offset.
- `sourceFileSha256`: SHA-256 of the unchanged source file. Re-encoding produces a new dataset and hash.
- `rightsStatus`: `CLEARED` or `INTERNAL_RESEARCH_ONLY`.
- `provenanceStatus`: `FIRST_PARTY_CAPTURE`, `LICENSED_THIRD_PARTY`, or `PUBLIC_DOMAIN`.
- `machineId` and `boardId`: stable identifiers; do not use a model nickname as both.
- `ballCount`, `launchPower`, `fireRatePerMinute`, and signed `boardTiltDegrees`: settings used for the whole capture. Split a recording when any changes.
- `measurements`: at least one metric that was actually measured. Never fill unavailable metrics with zero.

Trajectory summaries also require `trajectorySampleRateHz`. Heatmap summaries require `heatmapCellSizeMillimeters`; board coordinates are millimetres with the same origin and Y direction documented by the simulator coordinate transform. Raw video remains identified by its SHA-256; re-encoding is a different source.

## Aggregate metric names and units

- Outcomes: `startRate`, `outRate` (terminal events divided by all launched balls).
- Dwell: `averageLifetime`, `medianLifetime`, `p95Lifetime` (seconds from launch to terminal event or timeout).
- Collisions: `averageCollisionCount`, `medianCollisionCount`, `p95CollisionCount` (contact events per ball), `collisionFrequencyPerSecond` (contacts divided by accumulated ball-seconds), `averageReflectionAngleDegrees` (absolute direction change from the immediately pre-contact velocity to post-contact velocity for the tagged calibration contacts).
- Velocity: `averageVelocity`, `p95Velocity`, `maxVelocity` (metres per second, sampled uniformly at `trajectorySampleRateHz`).
- Trajectory: `averageTrajectoryPathLengthMillimeters` (mean sum of successive board-coordinate sample distances per ball).
- Heatmap: `heatmapOccupiedCellRate` (cells with at least one passage divided by all cells), `heatmapEntropy` (natural-log entropy of normalized cell passages).
- Derived comparisons: `heatmapJensenShannonDivergence` (natural log, 0 to `ln(2)`), `trajectoryMeanAbsoluteErrorMillimeters`, and `reflectionAngleMaeDegrees`. Both-zero Heatmaps have divergence 0; if only one side has zero total passages, divergence is the maximum `ln(2)`.
- Routes: `leftRouteRate`, `centerRouteRate`, `rightRouteRate` (first route sensor entered, divided by balls that entered any route sensor; the three values are mutually exclusive).

The observed and simulated sides passed to `calibrationLoss` must use the same units, sampling rate, heatmap grid, sensor definitions, and route rule. The loss compares only metric names present on both sides and contains no embedded target values.

## TRAIN and HOLDOUT

Choose the split before tuning. `TRAIN` may guide parameter changes. `HOLDOUT` must come from a separate capture and is evaluated only after the parameters are frozen. Mixing them makes a board look calibrated when it merely overfits one recording, so `BOTH` and other ambiguous split values are rejected.

## Evidence audit — 2026-08-11

### Result

No repository or user-provided asset currently qualifies as real-machine calibration evidence. In particular, there is no raw real-machine video at 240 fps or faster, no measured pixel→board-mm control points, no annotated ball trajectory, no isolated impact with pre/post velocity, and no complete START/OUT terminal record. Therefore no observed fixture was created and HOLDOUT calibration must not be claimed.

This is a checked absence, not an assumption:

| Audited source | Confirmed contents | Calibration decision |
|---|---|---|
| `research-data/` | 40 rights-labelled pachinko still references; generated/local audio; one 16 fps generated story MP4 | Still images have no time base or terminal event; generated media is not a real machine |
| `experiments/` | Seeded simulator outputs | Simulation data cannot be used as observed evidence |
| `apps/simulator/public/assets/story/story-smooth.mp4` | Original HyperFrames animation, 640×360, 30 fps, 255 frames | Presentation asset, not a camera capture |
| User image `S__91209761.jpg` | 869×1884 phone screenshot, SHA-256 `fa8c97958a4083b4701099d768a11d8ac0a6dadff87b8bb0ab3f14d4d835581e` | Useful only for presentation/UI reference; no visible physical trajectory or rights record for the depicted artwork |
| User image `スクリーンショット 2026-08-10 20.17.19.png` | 1276×1112 simulator screenshot, SHA-256 `898100696b89d9d510b3be96fee591cef841d0c5f38b455d22b88b20ce4230fa` | Screenshot of this simulator, not an independent real machine |

The local Wikimedia inventory is `research-data/wikimedia-images.ndjson` (100 records, SHA-256 `b53e9a78ab2b7b1a6d9e66f91ab7be2da9a63be42f0dd76e2087ed4fe0c243f6`). Forty records are tagged `domain=pachinko`. They have a verified Commons licence page but remain `observation-only`/`research-only` in this project. Representative front views show historic or heavily occluded machines and have no measured coplanar scale, lens calibration, launch setting, or terminal labels. They may guide visual vocabulary only; they must not populate `ObservedCapture`.

Public evidence searches performed without login or restricted downloads:

- Wikimedia Commons API: `pachinko`, `pachinko ball`, `pachinko slow motion`, `パチンコ`, and `パチンコ スロー`, each restricted to video. No result contained a rights-clear 240 fps full-board ball capture with the required metadata; the Japanese results were mostly unrelated/promotional videos.
- GitHub repository search: `pachinko physics`, `pachinko simulation`, `pachinko trajectory`, and `パチンコ 物理演算`. Five likely repositories were tree-audited; all were code/game simulations and exposed no observed trajectory/video/CSV asset. Unlicensed repositories were not copied.
- Zenodo API: eight text/publication false positives and no physical pachinko dataset.
- Internet Archive advanced search: 157 broad movie matches; the targeted pachinko + slow-motion/240-fps/high-speed query returned two video-game/promotional false positives. No rights-clear raw physical capture with frame/camera metadata was found or downloaded.

Search results can change. A discovered video still fails the trust boundary unless its source file, licence, camera metadata, coordinate controls, launch settings, and annotations are supplied together.

### Target machine

The repository currently models an `eva15`-inspired prototype, so the provisional capture target is **P 新世紀エヴァンゲリオン ～未来への咆哮～**. Before recording, the owner must confirm the exact marketed model/type and board revision. Record a stable `machineId` from the physical unit and a separate `boardId`; do not use `eva15-inspired` as proof that the simulator and captured board are identical.

### Minimum 100-ball pilot unblock checklist

The pilot is one fixed TRAIN session. It validates capture quality; it is not enough to claim final calibration. After parameters are frozen, record a second independent 100-ball HOLDOUT session with a different raw-file hash and `captureSessionId`.

1. **Authority and source** — use a first-party machine or obtain written owner/location permission. Avoid faces, voices, adjacent screens, and copyrighted presentation footage where practical. Keep the unchanged camera original; do not use DRM/ripped/stream-downloaded material.
2. **Machine record** — photograph the type plate for private traceability and record exact model, board revision, ball diameter/mass sample, board tilt, board-to-glass gap, handle mark, firing rate, date/time/timezone, and any maintenance or nail adjustment. Do not put serial numbers in the tracked repository.
3. **Full-board camera** — rigid tripod, optical axis normal to the board, stabilization and autofocus disabled, manual exposure/white balance, at least 1920×1080 at a verified 240 unique frames/s, shutter 1/2,000 s or faster, and at least 12 pixels across an 11 mm ball everywhere in the playfield. Avoid clipping metal highlights.
4. **Coordinate controls** — place or survey at least four non-collinear points on the board plane and reserve additional points for reprojection checks. Store their measured millimetre coordinates in `board-mm-top-left-y-down`; do not derive physical scale from cabinet width or an object at another depth.
5. **One fixed launch condition** — use one documented handle mark and a low enough firing rate (recommended 25 balls/min for the pilot) that identities do not overlap. Start a new capture if power, tilt, ball lot, camera, or board adjustment changes.
6. **Complete terminals** — launch exactly 100 balls and keep each visible from launch through START, OUT, OTHER, or an explicitly missing terminal. Define START/OUT sensor polygons before annotation. Never relabel an occluded/missing result as OUT.
7. **Isolated impacts** — separately record at least ten clean impacts for each calibrated collider material/role at 1,000 unique frames/s or faster, shutter 1/8,000 s or faster, ball diameter at least 40 pixels, coplanar scale visible, and no simultaneous second contact. Synchronize cameras with a visible LED flash if full-board and macro recordings are paired.
8. **Integrity checks** — verify frame count/rate and duplicate frames, retain variable-frame-rate metadata if present, calculate SHA-256 over the unchanged raw file, and record camera/device/lens/capture-mode metadata. A slow-playback export is not proof of a 240 fps capture.
9. **Annotation checks** — unique ball IDs; strictly increasing frame/time samples; collision time inside lifetime; measured pre/post velocity only for isolated contacts; first route assigned once; terminal at or after the final sample; reprojection p95 not below median.
10. **Acceptance before tuning** — all 100 launches accounted for, at least 95 complete terminals, no interpolated frames, median reprojection error ≤1 mm and p95 ≤2 mm (project pilot gates), and the JSON passes `calibration:observed`. Failed balls remain recorded with missing terminal data and the session is not silently trimmed.

Suggested private layout:

```text
research-data/calibration/eva15-pilot-train/
  raw.mov
  capture.json
  permission-note.txt
  camera-settings.txt
research-data/calibration/eva15-holdout/
  raw.mov
  capture.json
  permission-note.txt
  camera-settings.txt
```

Verification commands:

```bash
ffprobe -v error -count_frames -select_streams v:0 \
  -show_entries stream=codec_name,width,height,r_frame_rate,avg_frame_rate,nb_read_frames,duration \
  -of json research-data/calibration/eva15-pilot-train/raw.mov
shasum -a 256 research-data/calibration/eva15-pilot-train/raw.mov
npm run calibration:observed -- --capture research-data/calibration/eva15-pilot-train/capture.json
npm run calibration:observed -- \
  --train research-data/calibration/eva15-pilot-train/capture.json \
  --holdout research-data/calibration/eva15-holdout/capture.json
```

The fixtures in `tools/calibration/src/index.test.ts` are synthetic parser tests. Their repeated SHA strings and invented coordinates are deliberately not calibration observations.

### Rights-labelled static source inventory (visual reference only)

The 40 existing pachinko stills and their source-page licences are listed below. Licence verification does not make a still image trajectory evidence.

**CC BY-SA 3.0 (9):** [Masamura gauge featured PACHINKO](https://commons.wikimedia.org/wiki/File:Masamura_gauge_featured_PACHINKO.jpg), [Pachinko machine, Tokyo (screen blurred)](https://commons.wikimedia.org/wiki/File:Pachinko_machine,_Tokyo_(screen_blurred).jpg), [Insideanoldpachinkomachine](https://commons.wikimedia.org/wiki/File:Insideanoldpachinkomachine.jpg), [Goku Pachinko](https://commons.wikimedia.org/wiki/File:Goku_Pachinko_-_panoramio.jpg), [Jackpot and pachinko machines](https://commons.wikimedia.org/wiki/File:Jackpot_and_pachinko_machines.jpg), [Mechanical sankyo pachinko machine](https://commons.wikimedia.org/wiki/File:Mechanical_sankyo_pachinko_machine.jpg), [Pachinko balls](https://commons.wikimedia.org/wiki/File:Pachinko_balls.jpg), [Electric City Akihabara Pachinko](https://commons.wikimedia.org/wiki/File:Electric_City_Akihabara_Pachinko.jpg), [ESPACE-Shinjyuku](https://commons.wikimedia.org/wiki/File:ESPACE-Shinjyuku_(pachinko_shop).JPG).

**CC BY 2.0 (9):** [Regulation 7 Dreamcast](https://commons.wikimedia.org/wiki/File:Regulation_7_Dreamcast_pulled_out_of_a_pachinko_machine_in_Japan.jpg), [Regulation 7 Sega Dreamcast](https://commons.wikimedia.org/wiki/File:Regulation_7_Sega_Dreamcast_pulled_out_of_a_pachinko_machine_in_Japan.jpg), [Lascar A Pachinko Parlor](https://commons.wikimedia.org/wiki/File:Lascar_A_(then)_recently_opened_Pachinko_Parlor_(1299714600).jpg), [Pachinko TUC Shop 2011](https://commons.wikimedia.org/wiki/File:Pachinko_TUC_Shop_2011_(5463688387).jpg), [CR Pachinko AKB48](https://commons.wikimedia.org/wiki/File:CR_Pachinko_AKB48_(8472667577).jpg), [Christmas decoration at a Pachinko parlor](https://commons.wikimedia.org/wiki/File:Christmas_decoration_at_a_Pachinko_parlor_in_Shinjuku_2012-12-23.jpg), [Ginza Pachinko meet wall](https://commons.wikimedia.org/wiki/File:Ginza_Pachinko,_meet_wall_(7998853213).jpg), [Aladdin Pachinko Parlor](https://commons.wikimedia.org/wiki/File:Aladdin_Pachinko_Parlor,_Shinjuku_(53415760852).jpg), [Jumbo Pachinko Lounge](https://commons.wikimedia.org/wiki/File:Jumbo_Pachinko_Lounge,_Shinjuku_(20253439969).jpg).

**CC BY 3.0 (8):** [Machine 1](https://commons.wikimedia.org/wiki/File:Pachinko_machine_1.JPG), [Machine 2](https://commons.wikimedia.org/wiki/File:Pachinko_machine_2.JPG), [Machine 3](https://commons.wikimedia.org/wiki/File:Pachinko_machine_3.JPG), [Machine 4](https://commons.wikimedia.org/wiki/File:Pachinko_machine_4.JPG), [Machine 5](https://commons.wikimedia.org/wiki/File:Pachinko_machine_5.JPG), [Machine 6](https://commons.wikimedia.org/wiki/File:Pachinko_machine_6.JPG), [Machine 7](https://commons.wikimedia.org/wiki/File:Pachinko_machine_7.JPG), [Machine 8](https://commons.wikimedia.org/wiki/File:Pachinko_machine_8.JPG).

**CC BY-SA 4.0 (9):** [Pachinko Machine](https://commons.wikimedia.org/wiki/File:Pachinko_Machine.jpg), [2015 0922 Pachinko Kicona](https://commons.wikimedia.org/wiki/File:2015_0922_Pachinko_Kicona.jpg), [Hankai Daiichi Pachinko Tennoji](https://commons.wikimedia.org/wiki/File:Hankai_Daiichi_Pachinko_Tennoji.jpg), [AVIVA Kannai](https://commons.wikimedia.org/wiki/File:AVIVA_Kannai_Store_(PACHINKO_%26_SLOT).jpg), [Taiyo Pachinko 1](https://commons.wikimedia.org/wiki/File:2020_Corona_Virus_Shock_at_Taiyo_Pachinko_(1).jpg), [Taiyo Pachinko 2](https://commons.wikimedia.org/wiki/File:2020_Corona_Virus_Shock_at_Taiyo_Pachinko_(2).jpg), [Corona Distance at Pachinko Shop Namba](https://commons.wikimedia.org/wiki/File:Corona_Distance_at_Pachinko_Shop_Namba.jpg), [Pachinko parlor in Hsinchu City](https://commons.wikimedia.org/wiki/File:A_Pachinko_parlor_in_Hsinchu_City.jpg), [N-1 Niigata](https://commons.wikimedia.org/wiki/File:Daigaku-mae_Branch,_Pachinko_%26_SLOT_N-1,_Niigata,_Japan,_September_2021.jpg).

**CC BY-SA 2.0 (5):** [1970s pachinko machine](https://commons.wikimedia.org/wiki/File:1970%27s_pachinko_machine_(3714670178).jpg), [Inside of pachinko](https://commons.wikimedia.org/wiki/File:Inside_of_pachinko.jpg), [At Pachinko Parlor](https://commons.wikimedia.org/wiki/File:At_Pachinko_Parlor.jpg), [Inside a pachinko parlor](https://commons.wikimedia.org/wiki/File:Inside_a_pachinko_parlor.jpg), [Gundam pachinko event](https://commons.wikimedia.org/wiki/File:Gundam_pachinko_event_at_Akihabara_(24687442987).jpg).
