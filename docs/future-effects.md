# Future Effects, Audio, and 3D

Physics emits typed facts and never selects or plays media. A future game layer maps facts such as `sensor.enter` into lottery state, effect selection, and presentation commands.

## Effect assets

Each effect is data (`id`, type, path, duration, priority, preload policy, tags). `EffectRegistry` validates manifests and resolves metadata. `AssetLoader`, `PreloadQueue`, and `AssetCache` are interfaces so 500+ entries can remain lazy. Only an intentionally small preload budget may be active at startup.

Suggested data directories include normal, chance, reach, super-reach, blackout, rainbow, jackpot, premium, round, and ending. Adding a generated MP4/WebM should require a manifest entry, not a source-code branch.

## Audio

Audio manifests map semantic cue IDs to sources and policy. An AudioSystem may subscribe to physics/game events (for example `nail.hit`) and choose variants, concurrency limits, and volume. Physics never imports Web Audio or file paths.

## 3D mechanisms

Blender exports visuals as GLB/glTF for Three.js. Rapier mechanism collider definitions remain board data. A mechanism adapter exposes `initialize`, `activate`, `deactivate`, `update`, and `reset`; visual animation follows authoritative simulation state.

## Economy and redemption

Economy remains an independent integer, append-only ledger boundary. Real-money redemption is absent and `FEATURE_REAL_MONEY_REDEMPTION` stays false. Any future legally reviewed integration must sit behind a `RedemptionProvider` adapter and cannot affect physical outcomes.
