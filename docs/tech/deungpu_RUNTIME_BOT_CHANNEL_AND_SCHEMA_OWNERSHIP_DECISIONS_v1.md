# ดึ๋งปุ๊ — RUNTIME_BOT_CHANNEL_AND_SCHEMA_OWNERSHIP_DECISIONS.md v1.2

> สถานะ: **P1/P2 Decision Tracking / v1.2 Continuity Foundation**
> Scope: Reconnect, Character Autonomy (historically “Offline Bot”), Channel Assignment, Skill/Knobs Ownership
> ใช้คู่กับ:
> - `deungpu_project_checkpoint_v15_p0_scope_lock_ready.md` (เดิมอ้าง v14 — v15 supersede, เนื้อหา §59 เดียวกัน)
> - `deungpu_ENGINE_FOUNDATION_DECISIONS_v1.md`
> - `deungpu_MAP_SCALE_AND_SPAWN_DENSITY_SPEC_v1.md`

---

## 0.0 Amendment Log — v1.1 (2026-07-15) — Real-character Autonomy (D-067)

> **CURRENT BOT RUNTIME AUTHORITY:** `docs/decisions/D-067-character-autonomy.md` + checkpoint v15.5 §4.1–§4.2. ห้าม implement §3 worker/background/ghost/private/offline simulation หรือ §6 ข้อ 2 เดิม; historical text คงไว้เพื่อ traceability

- Character Autonomy ควบคุม actor จริงหนึ่งตัว keyed by character identity; client connection เป็น controller attachment ไม่ใช่ actor identity
- client disconnect ขณะ autonomy active ไม่เข้า ordinary “เกิน 30s → safe camp” flow: server ถือ actor/state/positionเดิมใน real world/channel และ reconnect attachกลับ actorเดิม. Ordinary manual reconnect rulesใน §2 ยังใช้เมื่อไม่มี active autonomy
- manual move/skill ต้อง revoke automation authority + checkpoint + fence stale commands ก่อน apply manual intent
- actor จริง visible/attackable ใช้ combat/reward/resource pipeline ปกติและนับ channel/pocket automation population; ห้าม boss/elite/event/secret/unsafe/unapproved area
- worker ใช้ได้เฉพาะ schedule dispatch, report projection, notification หรือ telemetry; ห้าม simulate combat/reward/world presence
- Free/Plus safe-stopเมื่อ server restart; Pro resumeได้เฉพาะ durable checkpointที่ validationผ่านตาม D-067

## 0.0.1 Amendment Log — v1.2 (2026-07-15) — Server-authoritative Continuity Reducer

PR3 ใช้ pure reducer ฝั่ง server ที่ไม่ import tier/config/DB และล็อก state ตาม checkpoint v15.5 §4.2:

`WORKING` · `TRAVELING` · `COMBAT` · `LOOTING` · `RECOVERING` · `RETURNING_TO_TOWN` · `SELLING` · `DEPOSITING` · `RESTOCKING` · `RETURNING_TO_WORK` · `PAUSED` · `WAITING_FOR_OWNER` · `COMPLETED` · `FAILED`

Runtime invariants:

- state change มาก่อน movement/attack side effect; transition ทุกครั้งใช้ server time + expected revision. revision mismatch reject โดยไม่ mutate เพื่อ fence async callback เก่าหลัง takeover
- `PAUSED`/`WAITING_FOR_OWNER` ออก automation command ไม่ได้; `COMPLETED`/`FAILED` ไม่มี outbound transitionใน run เดิม
- manual takeover transition `PAUSED` ก่อน release actor. checkpoint เก็บ paused snapshot + interrupted operational state แต่ resume เริ่ม `WORKING` และ re-evaluate live HP/inventory/position; interrupted state ไม่ใช่คำสั่งให้ replay
- `action` ใน wire เดิมเป็น compatibility projection ที่ derive จาก continuity state; client ห้ามสร้าง state machineคู่ขนาน
- PR3 wire/runtime ใช้จริงเฉพาะ `WORKING`/`TRAVELING`/`COMBAT`/`PAUSED`. `LOOTING` และ recovery/town/workflow/terminal entry policy ยัง inert จนมี authoritative seam ใน PR4–PR6
- PR3 ห้ามเพิ่ม Prisma/migration, auto-sell, recovery routine, goal chain, map transition, schedule หรือ restart resume

## 0.0.2 Amendment Log — v1.3 (2026-07-16) — PR5 recovery seams + town warp (D-069/D-070)

PR5 เปิด authoritative seam ตามลำดับ (owner lock 2026-07-16 — `docs/decisions/D-069-bot-town-warp.md`, `docs/decisions/D-070-bot-town-service-policy.md`):

- **Same-map recovery ใช้งานจริง:** `RECOVERING`/`RETURNING_TO_WORK` มี execution seam จริง (opt-in potion ผ่าน consumable service เดียวกับ manual, death recovery สังเกต respawn จริง + A* กลับ pocket, pocket fallback ใน map เดิม) — Free ไม่ใช้เส้นทางเหล่านี้และคง behavior PR4 เดิม
- **Town states เปิดพร้อม server-owned warp transfer:** `RETURNING_TO_TOWN`/`SELLING`/`DEPOSITING`/`RESTOCKING` ผูกกับ actor transfer ระหว่าง MapRoom (reserve seat → detach → attach identity เดิม → rollback fail-closed; actor อยู่ห้องเดียวเสมอ) — runtime ตัวเดิม rebind host เพื่อรักษา revision fence และ `bot_sessions` row เดียวต่อ run; `LOOTING` ยัง inert
- Town transaction ทำที่ตำแหน่งจริงใน city-hub ผ่าน service/gate เดิม (`shopForMap`/`storageAvailableForMap`) — โครงสร้างกัน remote transaction โดยตัวมันเอง; ห้าม emit achievement จาก seam ของบอท
- Stop reason `town_trip_failed` → `WAITING_FOR_OWNER` (ตาราง settlement 14 ตัว); live tier recheck ระหว่าง run fire `expired_readonly` ได้จริง

# 1. Purpose

v13 ปิด engine foundation หลักแล้ว ได้แก่:
- True 2D Isometric Pixel Art
- diamond grid
- fixed camera
- 5 directions drawn + mirror
- separated map rooms/channels
- weird map behavior = level design + simple triggers
- server-wide milestone secrets = future
- weekly condition = same layout + modifiers
- risk zone = sub-zone based
- elite spawn = fixed pocket + random point inside pocket

เอกสารนี้ล็อกคำตอบที่เหลือสำหรับ P1/P2:
1. Reconnect behavior
2. Character Autonomy materialization (historical §3 “Offline Pro Bot” ถูก superseded)
3. Channel selection / party sync
4. Skill Model / Design Knobs ownership

---

# 2. Reconnect Behavior

> **AMENDED โดย §0.0/D-067:** ordinary manual reconnect ด้านล่างยังใช้; active Character Autonomy reconnect ต้อง attach ไป actor/state/position ล่าสุดและเสนอ instant takeover

## Decision

ใช้ระบบ:

> **30s Grace Reconnect → same room/channel/position if valid, otherwise map safe camp**

## Behavior

```txt
Reconnect <= 30s:
- พยายามกลับ room/channel เดิม
- กลับตำแหน่งเดิม
- party/channel เดิม
- restore state เท่าที่ server ยัง hold ได้

Reconnect > 30s:
- กลับ safe camp / จุดวาปของ map นั้น

Reconnect invalid / room closed / state corrupt:
- กลับ safe camp ของ map นั้น
- กรณี severe invalid เท่านั้นค่อย fallback เมืองหลัก
```

## Design Intent

- มือถือ / Chrome / Wi-Fi / 4G/5G มีโอกาสเน็ตแกว่ง
- เกมเป็น farming MMORPG ไม่ควรลงโทษผู้เล่นหนักจากหลุดสั้น ๆ
- กลับเมืองหลักทันที UX แย่เกินไป
- safe camp เป็น fallback ที่ปลอดภัยและไม่ทำให้ exploit ง่าย

## Guardrails

- ไม่ guarantee ว่ามอนเดิมที่ตีอยู่ยังอยู่ครบ 100%
- server state ปัจจุบันถือเป็น source of truth
- reconnect ห้ามใช้เป็น exploit หนีตาย
- ใน combat/PvP/boss critical state สามารถบังคับ safe camp ได้ถ้าจำเป็น
- ถ้า reconnect กลับตำแหน่งเดิมแล้วตำแหน่งไม่ปลอดภัย/invalid ให้ย้ายไป safe camp

## Tech Notes

กระทบ:
- Colyseus room session timeout
- player seat reservation
- short-lived state hold
- room/channel reconnection token
- position validation
- safe camp fallback
- anti-exploit checks

---

# 3. Offline Pro Bot Materialization

> **SUPERSEDED ทั้ง section โดย §0.0/D-067 (2026-07-15):** ห้าม worker/background/ghost/private/offline reward simulation; actor จริงต้อง materializeใน real world/channelตลอด run

## Decision

แยก Online Bot กับ Offline Bot ชัดเจน

```txt
Online Bot:
- ผู้เล่นยัง online
- ตัวละครอยู่ใน map จริง
- ผู้เล่นอื่นเห็นได้
- ใช้ spawn จริง / แย่งมอนจริงตามปกติ

Offline Bot:
- เจ้าของ logout แล้ว
- bot รันเป็น worker/background simulation
- ตัวละครไม่ materialize ใน public map โดย default
- ไม่แย่ง spawn pocket กับผู้เล่นจริงโดยตรง
- output ถูกคุมด้วย route/density/economy config
```

## Final Rule

> **Online bot = materialized in real map**  
> **Offline Pro bot = background worker simulation by default**

## Why

เหตุผล:
- กัน public map เต็มไปด้วย offline bot
- ลด server load / pathfinding load / visual clutter
- ลดปัญหา bot แย่งมอนกับผู้เล่นจริง
- คุม economy output ง่ายกว่า
- เหมาะกับ Pro bot 12 ชั่วโมงมากกว่าให้ตัวละครเดินอยู่จริงทั้งคืน
- ทำให้โลก public ยังรู้สึกมีผู้เล่นจริง ไม่ใช่ bot เต็มเมือง/field

## Ghost / Private Bot

สถานะ:

> **Future Optional**

ยังไม่ใช่ foundation ตอนนี้

อนาคตถ้าทำได้:
- ghost เป็น visual-only
- หรือ private bot instance
- ไม่กิน spawn จริงของ public map
- ไม่ควรให้ผู้เล่นจริงต้องแย่งกับ offline bot จำนวนมาก

## Tech Notes

Offline bot simulation ต้องอิง:
- route config
- map density spec
- spawn density spec
- gold/hour guardrail
- item/hour guardrail
- bot output telemetry
- economy backoffice

---

# 4. Channel Selection / Room Assignment

## Decision

ใช้แนวทาง:

> **Default Auto-assign + Party Sync. Manual Channel Selection = Later/Future UI**

## Behavior

```txt
Solo player เข้า map:
- auto-assign channel ตาม load / population / availability

Party player เข้า map:
- พยายามส่งสมาชิก party ไป channel เดียวกัน
- ถ้า channel เต็ม ให้หา channel ที่รองรับ party ทั้งกลุ่ม
- ถ้าสมาชิกอยู่คนละ channel ให้มี action/prompt “ย้ายไปหา party”

World boss / event:
- อาจมี event channel / priority channel แยก
```

## Manual Channel Selection

Phase แรก:
- ไม่จำเป็นต้องมี full manual channel selector
- UI แสดง channel ปัจจุบัน เช่น `CH.1`
- engine ควรออกแบบให้เพิ่ม manual switch ภายหลังได้

Later/Beta/Launch:
- อาจมีปุ่มเปลี่ยน channel
- อาจมี channel list
- อาจมี restriction เช่น cooldown / combat lock / event lock

## Guardrails

- party sync สำคัญกว่า solo auto-assign
- ไม่ควรย้าย channel ระหว่าง combat
- ไม่ควรใช้ channel switch เพื่อหนี PvP/หนี death/รีเซ็ตมอน exploit
- world boss/event อาจ lock channel ตาม event rule

## Tech Notes

กระทบ:
- room assignment logic
- party-aware room allocation
- channel capacity
- channel transfer
- channel cooldown
- event channel priority

---

# 5. Skill Model / Design Knobs Ownership

## Problem

ปัจจุบันมีเนื้อหาใกล้กัน 2 ฝั่ง:
- design checkpoint มี Skill Data Model และ Design Knobs
- tech doc มี skill implementation / combat foundation / knobs table

เนื้อหาไม่ผิดและส่วนใหญ่ตรงกัน แต่ถ้าไม่มี ownership จะเกิดปัญหาในอนาคต เช่น:
- design ใช้ `baseMultiplier`
- tech ใช้ `damage_multiplier`
- Claude Code หรือ dev อ่านแล้วไม่รู้ว่า field ไหนเป็น source of truth

## Ownership Decision

### Design Owns

อ้างอิงหลัก:
- `v15 §50.1` (สืบจาก v13/v14) = canonical Skill Data Model
- `v15 §48` (สืบจาก v13/v14) = canonical Design Knobs

Design เป็นเจ้าของ:
- skill fields มีอะไรบ้าง
- meaning ของ field
- ค่า balance
- multiplier
- cooldown
- radius
- maxTargets
- targetShape
- damage type
- status effect intent
- botUsageRule intent
- guardrails
- design knobs
- balance ranges

### Tech Owns

Tech เป็นเจ้าของ:
- implementation
- runtime behavior
- client rendering pipeline
- server validation
- server calculation
- persistence
- DB/cache
- schema validation
- serialization
- migration/versioning
- performance optimization
- network sync

### Field Naming Source of Truth

> **Field names in code/JSON must follow v15 §50.1** (สืบจาก v13/v14 — schema เดียวกัน)

ตัวอย่าง canonical names:
- `skillId`
- `skillName`
- `class`
- `branch`
- `tier`
- `unlockLevel`
- `role`
- `description`
- `targetType`
- `targetShape`
- `range`
- `radius`
- `angle`
- `maxTargets`
- `hitCount`
- `damageType`
- `baseMultiplier`
- `scalingStat`
- `cooldown`
- `castTime`
- `activeTime`
- `recoveryTime`
- `resourceCost`
- `statusEffects`
- `crowdControl`
- `bossModifier`
- `pvpModifier`
- `comboTags`
- `animationCue`
- `vfxCue`
- `sfxCue`
- `damageNumberProfile`
- `screenShakeLevel`
- `hitStopLevel`
- `botUsageRule`
- `serverAuthority`
- `performanceBudget`

## Tech Doc Writing Rule

Tech doc ไม่ควร redefine field names ใหม่

ให้เขียนแบบนี้:

```txt
Skill schema follows checkpoint §50.1.
This document only describes how each field is implemented in runtime, server validation, client rendering, and persistence.
Do not rename or duplicate semantic fields.
```

## Adding New Fields

ถ้าต้องเพิ่ม field ใหม่:
1. เสนอ field ใหม่
2. design เคาะความหมาย
3. update canonical schema ใน design checkpoint
4. tech ค่อย implement
5. migration/versioning ต้องบันทึก

## Final Rule

> **Design owns what the skill is and how it should behave.**  
> **Tech owns how the approved skill schema runs in code.**  
> **Field names must follow checkpoint §50.1 as the single source of truth.**

---

# 6. Final Tech Summary

> **SUPERSEDED เฉพาะข้อ 2 Offline Bot โดย §0.0/D-067:** ข้อ reconnect/channel/schema ownership ที่ไม่ขัดยังใช้ต่อ

```txt
Pending P1/P2 Decisions:

1. Reconnect:
Use 30s grace reconnect. If valid, return to same map/channel/position. If invalid or expired, fallback to the map safe camp. City fallback only for severe invalid cases.

2. Offline Bot:
Online bot is materialized in the real map. Offline Pro bot runs as background worker simulation by default, does not appear in public map, and does not directly compete for real spawn pockets. Ghost/private bot visualization is future optional.

3. Channel:
Default is auto-assign. Party members must be synced into the same channel automatically where possible. Manual channel selection can be added later, but is not required for P1.

4. Skill/Knobs Ownership:
Checkpoint §50.1 is the canonical Skill Data Model and field naming source of truth.
Checkpoint §48 is the canonical Design Knobs source of truth.
Design owns fields, meanings, balance values, and guardrails.
Tech owns implementation, validation, persistence, runtime behavior, and performance.
Tech docs should reference checkpoint §50.1 instead of redefining fields with new names.
```

