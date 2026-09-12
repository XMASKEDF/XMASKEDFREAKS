# Game Asset Pipeline

## Architecture

- `../../Codex/` is the master source-art repository.
- `scripts/sync-game-assets.mjs` validates supported extensions, copies delivery assets into `public/games/`, and generates `public/games/asset-registry.json`.
- `lib/games/assets/registry.ts` defines named slots, environments, visual profiles, and audio slots.
- `lib/games/assets/asset-manager.ts` caches and lazy-loads browser images/audio and returns safe fallbacks for missing files.
- Gameplay engines request named slots. Physics, collision, scoring, AI, and input never reference filenames.
- ADMIN uploads are stored in the private operations flow using Supabase Storage and `game_assets`. Published ADMIN overrides take priority over build-time Codex assets.

## Premium Entity Atlas

The owner-supplied `premium-arcade-entity-atlas.png` is preserved at `../../Codex/References/` and delivered from `public/games/atlas/`. Crop metadata lives only in `lib/games/assets/registry.ts`; gameplay components never know atlas coordinates.

At startup, the Asset Manager lazily extracts registered regions to small cached canvases and removes only near-black sheet pixels. Space uses the ship, three enemy classes, shields, projectiles, explosions, and environment. Pac-Mask uses the masked player, ghost personalities, maze tiles, and power pellet. Slither uses palette-matched armored heads and body segments, arena texture, rare orb, and boost artwork.

Motion is engine-driven: idle breathing, enemy bobbing, ship hover, projectile travel, impact expansion, maze movement, ghost personality motion, snake steering, body articulation, and orb pulsing remain independent from source artwork.

## Artwork Workflow

1. Add original artwork to the relevant folder under `../../Codex/`.
2. Use descriptive slot names listed in `../../Codex/README.md`.
3. Run `pnpm sync:game-assets`, or restart `pnpm dev`.
4. Open the game route and verify alignment at desktop and mobile sizes.
5. For runtime publishing, use `ADMIN > Games > Premium Asset Pipeline`.

Missing or corrupted assets do not stop gameplay. The renderer uses the project-owned procedural fallback for that slot. Remote ADMIN overrides can be restored independently while preserving historical audit events.
