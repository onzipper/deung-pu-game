# Feature map — feature → spec § / source / tests

> อ่านเฉพาะแถวของงานตัวเอง · spec path ย่อ: **GS** = game spec v15 (`docs/design/deungpu_project_checkpoint_v15_p0_scope_lock_ready.md`), **TA** = tech architecture v1.5 (`docs/tech/deungpu_technical_architecture_v1_5_p0_scope_lock.md`), **P0** = `docs/design/deungpu_P0_SCOPE_LOCK_v1.md`

## P0 — Combat Feel (current phase)

| Feature | Spec | Source | Tests |
|---|---|---|---|
| P0-01 Runtime foundation (pixi app / lifecycle / resize / asset stub) | P0 §4.1 · TA §19 | `src/engine/config.ts`, `src/engine/runtime/app.ts`, `src/engine/runtime/resize.ts`, `src/engine/runtime/assets.ts`, `src/ui/GameCanvas.tsx`, `src/app/game/page.tsx` | `tests/engine-config.test.ts`, `tests/engine-resize.test.ts` |
| Iso foundation (projection/depth-sort/collision grid) | TA §17.1–17.3 · GS §57.1 | `src/engine/iso/coords.ts`, `src/engine/iso/depth.ts` | `tests/engine-iso-coords.test.ts`, `tests/engine-iso-depth.test.ts` |
| P0-03 Map config (schema/loader/test field) | P0 §4.3+§3 · TA §19 | `src/engine/map/types.ts`, `src/engine/map/loader.ts`, `src/engine/map/p0-test-field.ts` | `tests/engine-map-loader.test.ts` |
| P0-04 Renderer scene graph & depth sorting | P0 §4.2 · TA §11, §17.2 | `src/engine/render/depth-registry.ts`, `src/engine/render/camera.ts`, `src/engine/render/placement.ts`, `src/engine/render/scene.ts`, `src/engine/runtime/app.ts` | `tests/engine-render-depth.test.ts`, `tests/engine-render-camera.test.ts`, `tests/engine-render-placement.test.ts` |
| P0-05 Local player movement (keyboard/collision/camera follow) | P0 §4.4 · TA §17 | `src/engine/input/keyboard.ts`, `src/engine/movement/mover.ts`, `src/engine/player/local-player.ts`, `src/engine/config.ts` (PlayerConfig), `src/engine/runtime/app.ts` | `tests/engine-input-keyboard.test.ts`, `tests/engine-movement-mover.test.ts` |
| Direction resolver 5-dir + mirror | TA §17.4 · GS §57.2 | `src/engine/movement/direction.ts` (logical ทิศ) + `src/engine/animation/manifest.ts` (sprite mapping resolveClip) — **เสร็จทั้ง logical + sprite** | `tests/engine-movement-direction.test.ts`, `tests/engine-animation-manifest.test.ts` |
| P0-06 Sprite animation prototype (data-driven, 5-dir+mirror, idle/walk) | P0 §4.5 · TA §17.4 (L15) | `src/engine/animation/manifest.ts`, `src/engine/animation/player-placeholder.ts`, `src/engine/animation/animator.ts`, `src/engine/config.ts` (PlayerAnimationConfig), `src/engine/player/local-player.ts` | `tests/engine-animation-manifest.test.ts` |
| P0-07 Realtime room skeleton (join/leave · position sync · remote players visible · channel stub · offline-safe) | P0 §4.6+§4.7 · TA §6 · GS §57.3 | `src/shared/net-protocol.ts`, `src/engine/net/sync.ts`, `src/engine/net/net-client.ts`, `src/engine/net/remote-player-manager.ts`, `src/engine/config.ts` (NetConfig), `src/engine/runtime/app.ts`, `server/index.ts`, `server/rooms/MapRoom.ts`, `server/schema/MapRoomState.ts` | `tests/engine-net-sync.test.ts` (pure); 2-client integration = manual proof script (ดู current-state) |
| P0-08 Channel stub (channelId first-class, `filterBy(['mapId','channelId'])`, roomId จริงเข้า state, getNetDebugInfo) | P0 §4.7 · TA §6 · GS §57.3 | `src/shared/net-protocol.ts` (JoinOptions.channelId), `src/engine/config.ts` (NetConfig.channelId), `src/engine/runtime/app.ts` (joinOptions), `src/engine/net/net-client.ts` (getNetDebugInfo), `src/engine/net/sync.ts` (computePlayerCount), `server/index.ts` (filterBy), `server/rooms/MapRoom.ts` (onCreate channelId จาก client) | `tests/engine-net-sync.test.ts`, `tests/engine-config.test.ts` (pure); 2/3-client channel proof = manual script (ลบทิ้งแล้ว, ผลอยู่ current-state) |
| Combat juice (damage number, hit stop, shake, loot) | GS §17 ทั้งหมด · TA §11 (budget) | `src/game/` (planned) | (planned) |
| Skill data model (config-driven) | GS §50.1 (canonical fields) · TA §16.1 | (planned) | (planned) |
| Mob pack/spawn (local P0) | GS §17.2 · TA §18 · density spec | `src/game/` (planned) | (planned) |
| Performance guardrails (quality tiers, pooling) | GS §17.10 · TA §11 | `src/engine/` (planned) | (planned) |

## P1+ (ยังไม่เริ่ม — ดู TA §12 สำหรับ phase plan)

| Feature | Spec |
|---|---|
| World sync / Colyseus rooms | TA §6 · GS §57.3, §59.1, §59.3 |
| Persistence / inventory / enhancement | TA §7, §8 · GS §12 |
| Bot & report | TA §9 · GS §4, §59.2 |
| Market | TA §5, §7 · GS §5, §11 |
| Audio | TA §22 · GS §22–§42 |

## Infra

| Feature | Spec | Source | Tests |
|---|---|---|---|
| Docs system (AI OS) | ClickUp: AI Operating System — Starter Kit | `docs/`, `AI.md`, `CLAUDE.md` | `tests/docs-guard.test.ts` |
