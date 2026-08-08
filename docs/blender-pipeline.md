# Blender visual pipeline

Blender is used for visual cabinet, glass, decorative rail, and mechanism meshes.
Rapier board JSON remains the authoritative collision model. Runtime physics must
not be generated from the rendered GLB mesh.

`npm run generate:glb` provides a deterministic, dependency-free fallback export
when Blender cannot initialize Metal in a managed/headless session. It produces
the same named cabinet, rail, gate, and nail layers from the board JSON. The
editable Blender generator remains `assets/blender/generate_eva15_reference.py`.

## Local installation

Run from macOS Terminal, outside the Codex sandbox:

```sh
cd /Users/stork/pachinko-sim
bash tools/setup-blender-mcp.sh
```

The script installs Homebrew from its official installer when absent, then the
current Homebrew Blender cask and `uv`, downloads the
upstream `ahujasid/blender-mcp` add-on, enables it in Blender, disables MCP
telemetry, and registers the STDIO server with Codex. Existing MCP servers are
not modified.

macOS may require a password during Homebrew installation or an explicit
first-launch approval for Blender.

## Source-of-truth policy

- `boards/prototype/eva15_inspired_physics_v1.json`: physical dimensions and
  colliders in millimetres.
- `assets/blender/`: editable `.blend` sources and generated previews.
- `assets/models/`: exported `.glb` files used by the web renderer.
- Official Eva artwork, characters, logos, video, and audio are not copied.
- Unmeasured Eva 15 geometry is labelled `reference-based approximation`.

## Security

The selected third-party MCP add-on can execute Python inside Blender. It is
bound to `127.0.0.1:9876`, telemetry is disabled, and it must not be exposed to
the public network. Save `.blend` files before running broad scene mutations.
