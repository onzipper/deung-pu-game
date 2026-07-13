# ดึ๋งปุ๊ — Combat Bible

> ไฟล์: `deungpu_COMBAT_BIBLE_v1.md`  
> สถานะ: **v1.0 — Owner-delegated production baseline**  
> โปรเจกต์: **ดึ๋งปุ๊ — True 2D Isometric Web MMORPG**  
> Canonical references: `deungpu_project_checkpoint_v15_p0_scope_lock_ready.md`, `deungpu_technical_architecture_v1_5_p0_scope_lock.md`, `deungpu_ENGINE_FOUNDATION_DECISIONS_v1.md`, `deungpu_MAP_LAYOUT_BIBLE_v1.md`, `deungpu_MAP_SCALE_AND_SPAWN_DENSITY_SPEC_v1.md`  
> วัตถุประสงค์: กำหนด feel, targeting, hit validation, damage presentation, boss break และ combat acceptance โดยอ้าง canonical skill schema ไม่ redefine fields

---

## 0. Combat Fantasy

Combat ของดึ๋งปุ๊คือ:
- กวาดฝูงแล้วสะใจ
- อ่านท่าได้ ไม่ใช่ chaos ล้วน
- class ต่างกันด้วย geometry/timing/role
- boss ต้องใช้จังหวะ break ไม่ใช่ HP sponge
- server ตัดสินผล client ทำให้รู้สึกทันที

---

# 1. Authority

Client sends intent:
- move/aim/target/cast/interact

Server decides:
- cooldown/range/hit/damage/status/death/drop

Client predicts:
- local animation, anticipation, non-authoritative VFX

---

# 2. Damage Baseline

```txt
k = 50
DMG_base = ATK × baseMultiplier × [k / (k + effectiveDEF)]
effectiveDEF = max(0, DEF - Penetration)
crit = × (1 + CritDMG)
```

- single DEF in P2
- damageType semantic/future
- fixed-point math server-side
- multi-hit round total once then distribute

---

# 3. Target Shapes

- Single: target entity
- Cone: forward fan
- Line: segment/capsule
- Circle: point area
- Self/Area: centered on caster

Geometry must derive from canonical skill fields

Hit tolerance baseline:
```yaml
pointBlank: 1.40 tiles
rangePadding: 0.35 tiles
arcPadding: 20 degrees
```

Target assist:
```yaml
desktop: 0.60 tile
touch: 0.80 tile
keyboardAssist: 0.65 tile
```

---

# 4. Combat State Machine

```txt
IDLE → ANTICIPATION → ACTIVE → RECOVERY → IDLE
                    ↘ INTERRUPTED
                    ↘ DEAD
```

Rules:
- cooldown commit policy ระบุ per skill; default commit เมื่อ server accepts cast
- movement lock/slow data-driven
- client animation can start before result but must reconcile reject cleanly
- no resource pool in launch baseline; cooldown-only

---

# 5. Hit Feel

Every hit may combine:
- contact VFX
- hit flash
- damage number
- sound
- hit-stop local
- camera impulse local

Floor:
- kill: shake 1 + hit-stop 1
- crit: hit-stop 1; shake threshold-based

No effect may hide boss telegraph

---

# 6. Class Combat Identity

## Sword
Frontline, cone/cleave, durability, counter/break

## Archer
Range, projectile, circle AoE, multi-hit, rare hunt

## Spear
Line penetration, spacing, armor pressure/control

## Mage
Area burst, cast timing, shield break; cooldown/charges not mana in v1

## Occult
Seal, debuff, cleanse/support, delayed area control

---

# 7. Mob Combat

Normal mob:
- one readable attack
- short anticipation
- packs create positioning challenge

Elite:
- one modifier + one enhanced move
- visual mutation
- reduced burst via tierReduction

Boss:
- phase/telegraph/break
- no unavoidable one-shot without prior cue

---

# 8. Boss Break

Boss has guard gauge

```txt
Combat → guard depleted → BREAK → stagger window → recover → Combat
```

During break:
- boss cannot act
- damage multiplier config
- unique VFX/SFX/label
- guard refills/reset per phase config

Break Power is separate stat; normal AoE damage should not automatically be best break tool

---

# 9. Damage Number Modes

- Full
- Compact
- Critical Only
- Off

Server sends authoritative hit list/total; client presents according to mode

Multi-hit compact may show sequence + total, but HP must match total exactly

---

# 10. Death & Recovery

Player death rule must be readable and non-exploitative
- server marks dead
- client plays death
- respawn to approved point/safe camp
- reconnect cannot bypass death outcome
- no item loss in initial PvE baseline unless later decision

Mob death:
- reward grant server-side
- death animation client
- despawn timing independent from reward transaction

---

# 11. PvP Future Guardrails

- separate pvpModifier
- effect normalization where needed
- channel switch/reconnect cannot escape outcome
- no PvP loss in initial risk-zone baseline unless owner changes policy
- telegraph/readability stronger than PvE particle density

---

# 12. Bot Combat Rules

Online bot:
- uses same intent/authority path
- competes for real spawn

Offline bot:
- coarse simulation, no frame combat
- skill rule becomes efficiency parameter
- no secret/high-value decisions

---

# 13. Performance Budgets

- server tick 10–15Hz
- client target 60fps desktop/30fps mid mobile
- pooled effects/numbers
- AOI and spatial hash
- local player effect priority
- strangers reduced

---

# 14. Combat QA Matrix

- high latency 50/100/200ms
- packet loss
- edge of range/arc
- crowded pack
- reconnect during cast
- death during cast
- multi-hit low damage rounding
- target despawn
- mobile touch misclick
- low quality telegraph
- boss break at phase transition

---

# 15. Combat Definition of Done

- input response immediate
- server/client HP consistent
- rejected cast reconciles cleanly
- normal/crit/kill feel distinct
- telegraph readable in worst weather/VFX
- class geometry distinct
- no hardcoded skill balance outside config
- telemetry: cast, reject reason, hit count, damage, kill, TTK, death
