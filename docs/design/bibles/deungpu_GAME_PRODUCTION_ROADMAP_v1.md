# ดึ๋งปุ๊ — Game Production Roadmap

> ไฟล์: `deungpu_GAME_PRODUCTION_ROADMAP_v1.md`  
> สถานะ: **v1.1 — D-067 Character Autonomy amendment**
> โปรเจกต์: **ดึ๋งปุ๊ — True 2D Isometric Web MMORPG**  
> Canonical references: `deungpu_project_checkpoint_v15_p0_scope_lock_ready.md`, `deungpu_technical_architecture_v1_5_p0_scope_lock.md`, `deungpu_ENGINE_FOUNDATION_DECISIONS_v1.md`, `deungpu_MAP_LAYOUT_BIBLE_v1.md`, `deungpu_MAP_SCALE_AND_SPAWN_DENSITY_SPEC_v1.md`  
> วัตถุประสงค์: แยก Tech Roadmap P0–P6 ออกจาก Content/Art Roadmap เพื่อให้ทุกทีมทำงานคู่ขนานและไม่สับสนว่า content อยู่ P ไหน

---

## 0.0 Amendment — 2026-07-15 (D-067)

> **CURRENT P3 BOT DIRECTION:** P3 ใช้ real-character autonomy ตาม checkpoint v15.5 §4.1–§4.2/D-067. ข้อความ offline coarse simulation/worker economy ด้านล่างคงไว้เพื่อ historyแต่ถูก SUPERSEDED; Report/telemetry ยังทำเป็น background projectionได้

## 0. Critical Clarification

**P0–P6 เป็น Tech/Product Capability Phases** ไม่ใช่ลำดับที่ทีม Art ต้องรอ

Content มี track ของตัวเองและเริ่มได้ทันทีเมื่อ brief/spec พร้อม

---

# 1. Tech Roadmap

## P0 — Engine Foundation Vertical Slice
Goal: world renderer foundation
- Next.js + PixiJS
- true iso grid/depth
- movement prototype
- 5-dir+mirror
- room/channel stub
- dummy mobs/combat/debug

Gate: 2 clients see each other; renderer/movement stable

## P1 — World Sync
Goal: small online world works
- production realtime room
- movement predict/interp
- AI/aggro/leash/respawn
- spawn pocket/AOI
- skill intent→result
- reconnect/channel/party sync baseline

Gate: 2–5 players fight together reliably

## P2 — Persistence & Value
Goal: progress/items have safe value
- auth/account/character
- save position/progress
- inventory/equipment
- server RNG drops
- currency ledger
- enhancement/crack/แกร่ง
- starter shop
- mobile polish/auth security

Gate: concurrent mutation tests no dupe/balance mismatch

## P2B — Boss & Encounter Foundation
Goal: first meaningful boss connected to value
- Map 1 field boss
- phases/telegraphs/break
- authoritative rewards
- boss reconnect/edge cases

Gate: repeatable boss encounter no exploit, readable on mobile

## P3 — Bot & Report

> **AMENDED โดย D-067:** เปลี่ยน offline coarse simulation เป็น real actor control + manual takeover + continuity/recovery/workflow + durable checkpoint/validated Pro resume; Report เป็น output
Goal: official assistant value proposition
- ~~offline coarse simulation~~ **SUPERSEDED โดย D-067:** real-character autonomy ใน real world/channel
- tier/allowlist/stop conditions
- report UI
- calibration/telemetry

Gate: output within approved band and survives restart

## P4 — Market
Goal: player economy circulates
- listing/buy/cancel
- tax/sinks
- history/search/cache
- race/oversell protection

Gate: no oversell under load

## P5 — Hall of Fame & Announcement
Goal: recognition/social loop
- evidence-backed records
- weekly seal/title/reward
- world/guild announcements
- feed

Gate: every record auditable

## P6 — LiveOps & Backoffice
Goal: operate without deploy
- dashboards/alerts
- versioned config/rollback
- event/merchant/world condition control
- audit/RBAC

Gate: safe config rollout and rollback

---

# 2. Content & Art Roadmap (Parallel)

## C0 — Visual Foundation
Parallel: P0/P1
- master palette/scale/pivot
- SVG placeholder kit
- sword class
- Test Field tiles/props
- Map 1 visual brief

## C1 — First Production Vertical Slice
Parallel: P1/P2
- starter district city
- Map 1 tiles/props/landmarks
- 3 normal mobs + elite + boss art
- starter equipment
- sword VFX/SFX
- NPC/services

## C2 — Early World Expansion
Parallel: P2/P2B
- Archer then Spear
- Map 2–4
- early equipment tiers
- boss package
- quest/NPC sets
- weather/routine assets

## C3 — Mid Arc
Parallel: P3
- Mage/Occult
- Map 5–7
- bot/report UI art
- risk zone visual language
- dungeon/field event kits

## C4 — Late Arc
Parallel: P4
- Map 8–10
- high-tier/legendary art
- market UI/icons
- endgame monsters/bosses
- Arc 1 story assets

## C5 — Social & Recognition
Parallel: P5
- HoF presentation
- titles/badges
- weekly condition visual/audio sets
- celebration/announcement sequences

## C6 — Live Content
Parallel: P6+
- seasonal kits
- festivals
- new monsters/maps
- Arc 2/cosmic preparation

---

# 3. Critical Path

```txt
Asset scale/palette
→ Sword + Map1 graybox
→ P1 world sync
→ P2 persistence/drop
→ P2B first boss
→ P3 bot calibration
→ P4 market integrity
→ P5 recognition
→ P6 live operation
```

Art critical path:
```txt
Scale/pivot
→ one full character
→ one full monster family
→ Map1 environment
→ final replacement workflow
→ remaining classes/maps parallel
```

---

# 4. Milestone Gates

M0 Engine Proof = P0
M1 Online Combat Slice = P1 + C0
M2 Persistent Closed Alpha = P2 + C1
M3 Boss Alpha = P2B + C1 boss
M4 Assistant Alpha = P3 + C2/C3
M5 Economy Beta = P4 + C3/C4
M6 Social Beta = P5 + C4/C5
M7 Operable Launch Candidate = P6 + Arc 1 content target

---

# 5. Current Recommended Next Work

According to queue after P0+P1:
1. freeze Owner Decisions v1
2. produce Asset/Visual/Content specs
3. break down P2 issues
4. begin C1 assets in parallel
5. schedule P2B design before P3

---

# 6. Scope Rules

- phase gate must pass before high-value next system
- content can be produced early but cannot be marked release-ready before required tech gate
- no market before inventory/ledger integrity
- no offline bot economy before real-player farm telemetry
- no final art dependency for logic test; no permanent placeholder in release without acceptance
- mobile is gate, not post-launch polish

---

# 7. Launch Scope Decision Point

Launch content count is separate owner decision. Current design supports Map 1–10, but roadmap may ship staged content.

Recommended release planning:
- Closed Alpha: City starter + Map 1
- Expanded Alpha: Map 1–4
- Beta: Map 1–7
- Launch candidate: Map 1–10 only if quality gates pass; otherwise staged release without breaking Arc promise

No team should assume all 10 maps must be final before P3/P4 engineering can begin
