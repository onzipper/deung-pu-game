# `svg/` — SVG source assets (SVG-first, D-042/D-043)

Source of truth for all art is **SVG** (pixel art deferred indefinitely — D-042). World entities are
build-time raster→atlas; UI icons may stay inline. Spec: `deungpu_TECH_TEAM_DECISIONS_SVG_FIRST_NO_FIGMA_v1.md`
§2, Asset Bible §2–§5/§17–§19.

## Folders (spec §2.6)

```
svg/
  characters/   monsters/   npc/   companion/
  items/        ui/         vfx/   environment/   achievements/
  .build/       # generated manifests + atlas layout — gitignored, produced by `npm run svg:build`
```

An **animated world entity** lives in its own folder with an `entity.json` next to its frame SVGs
(e.g. `monsters/slime_leaf/`). **Icons / telegraphs** are single SVGs (no `entity.json`) — lint-only,
loaded inline or cached, not atlas-animated.

## Naming (Asset Bible §17, spec §2.6)

- Entity frames: `<assetId>_<anim>_<dir>_<frame>.svg` — e.g. `mon_slime_leaf_idle_s_000.svg`
- Icons/vfx: `<category>_<entity>_<variant>_v<NN>.svg` — e.g. `itm_mat_kraeng_common_v01.svg`
- `lowercase snake_case`; Thai display names live in data, never in filenames.

## Per-SVG requirements (spec §2.5, Asset Bible §4.1)

- Has `viewBox` matching the source canvas (`0 0 64 64` for entities).
- `shape-rendering="crispEdges"`; no blur / gradient / soft-shadow / runtime filter (D-043 V4).
- No `<script>`, event handlers, external/`data:` refs, embedded raster, `<foreignObject>`, or font
  dependency — enforced by the sanitizer (`npm run svg:lint`).
- Colors: **only the 32-palette** (Asset Bible §3) + `none`/`currentColor`. Rarity uses the V3 alias
  (`rarity.common` = Sand …). Corruption family is never used for rarity (D-043 V3).

## `entity.json` shape (drives the manifest generator)

```json
{
  "assetId": "mon_slime_leaf", "category": "monsters",
  "frameSize": [64, 64], "pivot": [32, 54], "mirrorSafe": true,
  "drawnDirections": ["S", "SW", "W", "NW", "N"],
  "mirrorMap": { "SE": "SW", "E": "W", "NE": "NW" },
  "animations": { "idle": { "fps": 6, "loop": true, "frameCount": 2 } }
}
```

The generated manifest is a superset of the engine format (`src/engine/animation/manifest.ts`:
`drawnDirections`/`mirrorMap`/`animations{frames,frameDuration,loop}`) and Asset Bible §19
(`assetId`/`frameSize`/`pivot`/`mirrorSafe`/`animations{fps,directions,contactFrame}`).

## Commands

- `npm run svg:lint` — sanitizer (security) + palette lint over every `svg/**/*.svg`.
- `npm run svg:build` — lint, then generate `svg/.build/manifests/*` + `svg/.build/atlases/*`.
  PNG rasterization is a TODO (needs a rasterizer dependency — see `scripts/svg/raster.ts`).
