# Audio / effect research corpus

This tool builds **100,000 feature observations**, not a cache of 100,000 copied sounds. At the default 500 ms window, the target is about 13.9 hours of audio from first-party, licensed, public-domain, or separately controlled internal-research sources.

Raw media and generated datasets belong under `research-data/` (gitignored). Do not extract YouTube, manufacturer, pachinko/pachislot-machine, or online-casino audio without permission. Their public pages may be recorded as `observation-only` URL metadata, but raw media must not enter product assets.

## Commands

```sh
npm run corpus:plan
node --import tsx tools/audio-corpus/src/cli.ts harvest-openverse --media image --target 100 --out research-data/openverse-images.ndjson
npm run corpus:images
npm run corpus:validate
<path-to-Hermes-Chrome.command> --remote-debugging-port=9223 about:blank
npm run audio:runtime-report
node --import tsx tools/audio-corpus/src/cli.ts validate --manifest research-data/wikimedia-images.ndjson --images research-data/image-observations.ndjson --target-images 100 --require-local-images
node --import tsx tools/audio-corpus/src/cli.ts extract --manifest research-data/sources.ndjson --out research-data/audio-features.ndjson --target 100000
node --import tsx tools/audio-corpus/src/cli.ts pitch-report --manifest research-data/sources.ndjson --out research-data/audio-pitch-report.json
npm run audio:music-report
```

`harvest-openverse` uses the API (never catalog-page scraping), 20 results per request, a 3.1 second interval, and only CC0/CC-BY claims. Openverse does not verify licenses, so harvested rows are raw candidates and remain `rights: "unknown"` / `rightsVerification: "observed"`; the landing-page license, relevance, and creator must be checked before downloading or extracting them.

`corpus:images` uses the Wikimedia Commons API, checks an exact Creative Commons/public-domain license URL, rejects restricted/small/non-raster/irrelevant results, deduplicates page IDs and SHA-1 values, saves the 100-source candidate ledger before downloads, then downloads 960 px reference files and stores a local SHA-256. Pachinko and slot-machine photos (including the CC BY-SA fallback pool) remain `research-only` because the depicted cabinet, characters, and trademarks can have separate rights. The abstract effect-reference group is limited to CC0/CC-BY/public-domain sources and is reusable only under its recorded license.

The completed local set is `research-data/wikimedia-images.ndjson` plus `research-data/images/wikimedia-curated/`. The raw Openverse ledger and download cache remain separate and are not counted as curated files.

`extract` keeps 48 kHz PCM so sharp 8–20 kHz content is not discarded. Alongside FFmpeg peak/RMS/LUFS and spectral measurements, each row records YIN F0 (150–6,000 Hz, confidence >= 0.85), MIDI note/name, cents, pitch coverage, 12-bin chroma, crest factor, and energy ratios for presence (2–4 kHz), brilliance (4–8 kHz), air (8–16 kHz), and extreme high (16–20 kHz). `pitch-report` retains the full frame timeline and note histogram. Noise/percussion stays unpitched when confidence is below the threshold.

`validate` counts unique `(source SHA-256, start, duration)` windows, assigns every window from identical source bytes to the same split, verifies feature labels against the source manifest, and hashes required local files again. It exits nonzero until the target and planned domain/event coverage are both reached. `datasetRole` keeps real calibration captures separate from generated references and generic DSP.

`audio:runtime-report` connects only to the dedicated Hermes Chrome CDP endpoint, opens and closes a local test tab, and renders the actual 13 `PlayAudio` cue families twice through Chromium's 48 kHz `OfflineAudioContext`. It fails if canonical PCM hashes differ, then writes duration, attack, pitch/note confidence, band energy, crest, RMS, peak, clipping, the runtime source SHA-256, and one hash per cue. Chromium's compressor can vary below one float ULP, so raw floats must remain within `1e-6`; hashing uses PCM16 with the four insignificant bits cleared and records that normalization explicitly.

`audio:music-report` deterministically condenses the ignored Nojiru source, feature, and pitch files into `docs/music-analysis-report.json`. Declared BPM is not a detected tempo, YIN notes are not musical keys, and standardized integrated LUFS/LRA/dBTP remain explicitly unmeasured unless those values are present in the input analysis. Generated controls and real-machine calibration counts are always reported separately.

The generated comparison set is tied to `SHOGO391/nojiru` commit `bbefab094522f17c85342f2fe4822f7e881292eb`, never treated as real-machine calibration. The reused implementation evidence is Nojiru's seeded context/noise (`packages/audio-lab/src/dsp.ts:18-21,83-88`), semitone-to-Hz conversion (`packages/audio-lab/src/se.ts:34-35`), catalog-to-WAV/manifest pipeline (`tools/assetgen/src/audio.ts:59-115`), and determinism/catalog tests (`packages/audio-lab/tests/audio.test.ts:62-71,140-175`). `validate` requires every `generated-reference` row to carry either a repository+40-character commit or a generator+version.

The same source manifest holds the 100 raw image candidates (`mediaType: "image"`). A separate image-observation NDJSON labels manually approved sources by effect type, dominant colors, luminance tier, text treatment, LCD/cabinet light coverage, PUSH visibility, and hold color. Validate it with `--images research-data/image-observations.ndjson`. Store URL/licensing metadata for every image. Only relevant, license-verified image files may be downloaded or copied into the app.

The source audit and legal dataset options are recorded in `docs/audio-corpus-research.md`.

Minimal source row:

```json
{"id":"first-party-pachinko-001","domain":"pachinko","mediaType":"audio","eventType":"confirm","datasetRole":"real-calibration","rights":"cleared","rightsVerification":"verified","provenance":"first-party","localPath":"research-data/raw/first-party-pachinko-001.wav","licenseName":"First-party capture","capturedAt":"2026-08-11T00:00:00+09:00","rewardLevel":4,"tags":["high-pitch","short"]}
```
