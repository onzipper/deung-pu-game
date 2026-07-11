# CODEMAP — file → responsibility

> structural เท่านั้น (path + หน้าที่ 1 บรรทัด) · test-enforced: path ที่อ้างต้องมีจริง (`npm test`)
> แก้/ย้าย/ลบ/เพิ่มไฟล์ ⇒ อัปเดตบรรทัดของมันใน commit เดียวกัน

## Next.js shell

- `src/app/layout.tsx` — root layout (font + globals)
- `src/app/page.tsx` — landing page (ยัง default create-next-app)
- `src/app/game/page.tsx` — route /game: server shell → render GameCanvas เต็มจอ
- `src/app/globals.css` — Tailwind v4 entry + theme vars
- `src/app/favicon.ico` — favicon

## Game engine (P0)

- `src/engine/config.ts` — shared config/types (EngineConfig, DEFAULT_ENGINE_CONFIG, tileSize 64×32, SceneTheme/CameraConfig/PropStyle/PlayerConfig/PlayerAnimationConfig+PlayerSpriteStyle) — ทุกค่าปรับได้อยู่ที่นี่
- `src/engine/runtime/app.ts` — createEngine(): ครอบ pixi Application (async init) + mount P0 Test Field scene + local player + ticker + fps ui + EngineHandle.destroy()
- `src/engine/runtime/resize.ts` — attachResize(): ResizeObserver บน container → renderer.resize; clampSize (pure)
- `src/engine/runtime/assets.ts` — asset loader stub (wrapper รอบ pixi Assets, manifest ว่าง)
- `src/engine/input/keyboard.ts` — keyboard intent tracker: MOVE_KEYS (WASD+arrows) + intentFromKeys (screen basis → tile-space, pure) + attachKeyboard (listeners + detach)
- `src/engine/movement/mover.ts` — stepMovement (pure): เดินต่อเนื่อง float tile + normalize diagonal + axis-separated collision slide + clamp dt
- `src/engine/movement/direction.ts` — resolveDirection (pure): tile vector → 8-dir logical (คิดจากมุมบนจอ) + directionToScreenUnit — เตรียม P0-06 sprite 5-dir+mirror
- `src/engine/player/local-player.ts` — createLocalPlayer(): pixi glue เชื่อม keyboard→mover→direction→animator→scene entity + camera follow; walk/idle + 5-dir+mirror animated sprite (แทน body+nose)
- `src/engine/animation/manifest.ts` — animation manifest (data-driven) + resolveClip (pure): logical dir → sprite source+mirror flag (5-dir+mirror, 8-dir override L15) + advancePlayhead (pure frame timing/loop) + createPlayerAnimationManifest
- `src/engine/animation/player-placeholder.ts` — generatePlayerTextures(): วาด placeholder sprite ด้วยโค้ด (Graphics→RenderTexture) — 5 ทิศ, walk/idle/attack, asymmetric ให้เห็น mirror; foot anchor คงที่
- `src/engine/animation/animator.ts` — createSpriteAnimator(): pixi glue เล่นเฟรมบน Sprite (setState/update) + mirror ด้วย scale.x=−1 รอบ anchor เท้า
- `src/engine/iso/coords.ts` — iso projection converters: TilePoint/ScreenPoint types + tileToScreen/screenToTile/snapToTile (pure math)
- `src/engine/iso/depth.ts` — iso depth sort key: depthKey(tile, zLayer) + band constants (pure math)
- `src/engine/map/types.ts` — MapConfig schema (spec P0 §4.3) + CollisionLayer/PropSpawn/MobPocket + packTile/isBlockedTile/isWithinBounds/isWalkableTile helpers
- `src/engine/map/loader.ts` — loadMapConfig(raw): validate + build blockedSet (MapConfigError, no zod)
- `src/engine/map/p0-test-field.ts` — P0 Test Field config data (24×24, spawn/collision/props/3 pockets)
- `src/engine/render/depth-registry.ts` — DepthRegistry<D> (pure): entity registry + compareDepth comparator + dirty-tracked sorted() — source of truth ของลำดับ depth
- `src/engine/render/camera.ts` — camera math (pure): computeMapScreenBounds / clampCameraScreen / lerpTile (fixed iso, no rotation/zoom)
- `src/engine/render/placement.ts` — entityFootToScreen (pure): lock convention "tile ที่ส่งเข้า API = foot ต่อเนื่อง → tileToScreen (ไม่ +0.5)"
- `src/engine/render/scene.ts` — createMapScene(): pixi glue — ground layer (grid/checker/blocked, วาดครั้งเดียว) + entity layer (depth-sorted via zIndex rank) + fixed camera follow + entity API (addEntity/moveEntity/removeEntity)
- `src/game/` — (planned) combat/entity/spawn บน engine

## UI (React overlay)

- `src/ui/GameCanvas.tsx` — "use client" bridge: mount/unmount engine (กัน StrictMode double-mount)

## Config

- `package.json` — scripts + dependencies (npm)
- `next.config.ts` — Next.js config
- `tsconfig.json` — TypeScript config (alias `@/*` → `src/*`)
- `eslint.config.mjs` — ESLint flat config
- `postcss.config.mjs` — PostCSS (Tailwind v4)
- `vitest.config.ts` — Vitest config

## Tests

- `tests/docs-guard.test.ts` — path-guard: ไฟล์ที่อ้างใน CODEMAP/feature-map/context ต้องมีจริง
- `tests/engine-config.test.ts` — EngineConfig defaults / merge / resolveResolution
- `tests/engine-resize.test.ts` — clampSize (pure resize helper)
- `tests/engine-iso-coords.test.ts` — iso converters: known values / round-trip fuzz / snapToTile
- `tests/engine-iso-depth.test.ts` — depthKey ordering + zLayer band non-overlap
- `tests/engine-map-loader.test.ts` — map loader validation (invariants throw) + P0 Test Field passes
- `tests/engine-render-depth.test.ts` — DepthRegistry: sorted order ตาม depthKey + tie-break + dirty tracking + lifecycle
- `tests/engine-render-camera.test.ts` — camera math: map screen bounds (จตุรัส/ไม่จตุรัส) + clamp ขอบ 4 ด้าน + content==viewport + lerp follow
- `tests/engine-render-placement.test.ts` — lock foot convention: entityFootToScreen = tileToScreen (ไม่ +0.5), ≠ tileCenterToScreen
- `tests/engine-input-keyboard.test.ts` — intent mapping screen→tile (W/W+D/ปล่อยหมด/ตรงข้ามหักล้าง) + basis project ถูกทิศ
- `tests/engine-movement-mover.test.ts` — stepMovement: เดินตรง/เฉียง normalize + clamp dt + collision slide แยกแกน + block หยุด
- `tests/engine-movement-direction.test.ts` — resolveDirection: 8 combo→ทิศ + มุม 45° ครบ + ขอบ 22.5° + idle คงทิศ + directionToScreenUnit
- `tests/engine-animation-manifest.test.ts` — resolveClip: 5 drawn ไม่ mirror + 3 mirror ชี้ source ถูก + ครบ 8 ทิศ×idle/walk + 8-dir override + error (unknown anim / ทิศไม่มี / mirror source ไม่วาด) + advancePlayhead timing/loop/clamp/guard

## Docs

- `AI.md` — universal agent entry
- `CLAUDE.md` — orchestrator entry
- `AGENTS.md` — framework traps (Next.js 16)
- `docs/README.md` — สารบัญ docs
- `docs/current-state.md` — live state
- `docs/decision-index.md` — locked decisions
- `docs/known-traps.md` — bug classes
- `docs/feature-map.md` — feature → spec/source/tests
- `docs/token-budget.md` — read budget
- `docs/context/engine.md` — engine context pack
- `docs/context/ui.md` — ui context pack
- `docs/design/` — game spec (v15 canonical + P0 scope lock + map bibles)
- `docs/design/art-reference/` — ภาพ ref จาก owner (visual north star) + index README
- `docs/tech/` — tech spec (architecture v1.5 + decision locks)
