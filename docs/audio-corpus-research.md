# Audio and visual-reference corpus

Status date: 2026-08-11 (Asia/Tokyo)

## Confirmed facts

- `tools/audio-corpus` plans exactly 100,000 fixed-window audio observations and 100 image sources.
- The default 500 ms window represents about 13.9 hours of source audio.
- FFmpeg extracts peak/RMS/LUFS and spectral statistics without copying audio into the app.
- `research-data/openverse-images.ndjson` currently contains 100 unique image candidates: pachinko 40, pachislot 40, online slot 20.
- Those Openverse rows are **candidates only**. All 100 are `rightsVerification: observed`; Openverse says its license data must be checked at the original landing page.
- `research-data/wikimedia-images.ndjson` contains the curated local set: 100 unique source IDs, files, paths, and SHA-256 values (40 pachinko, 40 pachislot, 20 effect primitives).
- All 100 Wikimedia rows have a verified landing-page license. The 80 machine/cabinet photos remain `research-only`; the 20 abstract-effect sources are CC BY and retain attribution.
- No manufacturer, YouTube, pachinko-hall, or online-casino audio was copied. Official product pages are observation-only references.

## 100,000-observation source options

For non-generative acoustic analysis, an exact 100,000-source composition is:

| Source | Rights used | Count |
| --- | --- | ---: |
| [Kenney audio assets](https://kenney.nl/support) | CC0 | 495 |
| [FSD50K](https://zenodo.org/api/records/4060432) | CC0 and CC BY only | 43,379 |
| [NSynth](https://magenta.tensorflow.org/datasets/nsynth) | CC BY 4.0 | 56,126 |
| Total |  | 100,000 |

For future commercial generative use, the safer initial composition is Kenney 495 plus NSynth 99,505. FSD50K contains Freesound material and needs a separate current-policy review before generative training.

[AudioSet](https://research.google.com/audioset/download.html) is another legal feature-level source: it publishes labels and 128-dimensional features under CC BY 4.0. This project does not fetch the underlying YouTube audio.

Openly licensed Japanese real-machine recordings are scarce. A live Openverse check returned 0 CC0/CC-BY audio results for `pachinko` and `pachislot`, so the machine-specific layer should be recreated from original synthesis and first-party recordings, not copied from manufacturers.

## Domain references

URLs from [SANYO](https://www.sanyobussan.co.jp/products/pachinko.html), [SANKYO](https://www.sankyo-fever.jp/products/), [KYORAKU](https://www.kyoraku.co.jp/lineup/), [Sammy](https://www.sammy.co.jp/japanese/products/pachislot/), [Universal](https://www.universal-777.com/product/slot/), [Pragmatic Play](https://www.pragmaticplay.com/en/games/), [Evolution](https://games.evolution.com/), [Play'n GO](https://www.playngo.com/games), and [Relax Gaming](https://www.relax-gaming.com/products/casino) are for timing/state observation only. Do not download their media without permission.

Research anchors:

- [Sounds like gambling (Scientific Reports, 2025)](https://www.nature.com/articles/s41598-024-83389-1): supports short-window acoustic analysis for gambling-environment sounds; cited media is not reusable training data.
- [The Impact of Sound in Modern Multiline Video Slot Machine Play](https://pubmed.ncbi.nlm.nih.gov/23821220/): sound increases excitement and perceived wins, so reward sounds must stay truthful to the actual result state.

## Provenance gate

```text
observed -> verified -> downloaded -> featured
```

An item advances only when its landing-page license, creator/attribution, asset URL, and intended use are recorded. Downloaded files also require SHA-256. Unknown or observation-only items cannot enter training features or product assets.

For visual references, retain machine/IP screenshots only as research-only observations. CC BY-SA is accepted only in that local reference pool and never copied into the app. Reusable visual ingredients should come from verified CC0/CC-BY/public-domain sources such as neon, LEDs, rays, gold particles, prisms, confetti, and fireworks.

## Commands

```sh
npm run corpus:plan
npm run corpus:images
node --import tsx tools/audio-corpus/src/cli.ts harvest-openverse \
  --media image --target 100 --out research-data/openverse-images.ndjson
node --import tsx tools/audio-corpus/src/cli.ts validate \
  --manifest research-data/wikimedia-images.ndjson \
  --target-images 100 --require-local-images
node --import tsx tools/audio-corpus/src/cli.ts extract \
  --manifest research-data/sources.ndjson \
  --out research-data/audio-features.ndjson --target 100000
```

The Openverse validation intentionally exits with status 2 until every candidate has been independently verified.
