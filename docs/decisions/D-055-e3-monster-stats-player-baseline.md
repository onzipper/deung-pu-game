# D-055 — E3 Map 1 monster combat stats + player baseline production lock (ปิด D-049 + D-019)
- Date: 2026-07-13 · Status: Locked · Supersedes: D-049 (E3 `OPEN — pending-owner-balance` → ปิด) + D-019 ส่วน "player baseline balance PENDING" (P1 Balance Proposal §2.1 → production) · Relates: D-047 (E1 boss), D-048 (E2), Combat Bible §2/§7/§8, Economy §10.1, Reinforcement doc §9

## มติ + เหตุผล (verbatim)

Decision: **E3 = ล็อกตารางค่าสถานะ combat มอน Map 1 ครบ 5 ตัวเป็น production + ล็อก player baseline (P1 Balance Proposal §2.1) เป็น production คู่กัน** · สูตร: `DMG = ATK × baseMultiplier × [50 / (50 + effectiveDEF)]` (Combat Bible §2, k=50) · `breakPower` = guard gauge ของบอส (ปริมาณ break ที่ผู้เล่นต้องทุบ; normal/elite = 0) · E3 เอาเฉพาะตัวเลข stat — **pattern ท่า elite/boss รอ Kit Proposal แยก** (ไม่อยู่ในมตินี้)

### 1. Monster combat stat table (production)

| field | slime | bird | boar | elite_boar | boss |
|---|---:|---:|---:|---:|---:|
| monsterId | mon_map1_slime | mon_map1_bird | mon_map1_boar | elite_map1_boar_rampage | boss_map1_resonant_guardian |
| level | 1 | 2 | 4 | 5 | 8 |
| hp | 45 | 70 | 150 | 420 | 2600 |
| attack | 6 | 7 | 12 | 17 | 26 |
| defense | 3 | 4 | 10 | 14 | 25 |
| moveSpeed (tiles/s) | 2.2 | 3.4 | 2.6 | 2.8 | 2.4 |
| attackRange (tiles) | 1.2 | 1.5 | 1.6 | 2.0 | 2.4 |
| attackCooldown (s) | 2.0 | 2.2 | 2.8 | 3.0 | 3.2 |
| anticipationMs | 350 | 300 | 550 | 650 | 800 |
| activeMs | 150 | 120 | 250 | 300 | 400 |
| recoveryMs | 500 | 450 | 700 | 800 | 700 |
| aggroRadius (tiles) | 5 | 6 | 6 | 8 | 10 |
| leashRadius (tiles) | 9 | 11 | 10 | 14 | 18 |
| breakPower (guard gauge) | 0 | 0 | 0 | 0 | 100 |
| tierReduction | 1.00 | 1.00 | 1.00 | 0.80 | 0.65 |

TTK เป้าหมาย (vs player level เดียวกัน, basic attack cd 0.6s mult 1.0): slime ~2.4s · bird ~3.0s · boar ~5.1s · elite ~16.8s · boss ~109s + break (boss ~2 นาที solo = รับได้) · identity/EXP/Gold/Respawn = คงตาม Economy §10.1 (ไม่แตะ)

### 2. Player baseline นักดาบ lv1–10 (production — P1 Balance Proposal §2.1)

| lv | HP | ATK | DEF | Speed |
|--:|--:|--:|--:|--:|
| 1 | 100 | 12 | 8 | 100 |
| 2 | 120 | 15 | 9 | 100 |
| 3 | 140 | 18 | 11 | 100 |
| 4 | 160 | 21 | 12 | 100 |
| 5 | 180 | 24 | 14 | 100 |
| 6 | 200 | 27 | 15 | 100 |
| 7 | 220 | 30 | 17 | 100 |
| 8 | 240 | 33 | 18 | 100 |
| 9 | 260 | 36 | 20 | 100 |
| 10 | 280 | 40 | 22 | 100 |

growth/level: HP +20, ATK +3, DEF +~1.5 · Secondary: Crit 5%, CritDMG +50% (locked TA §15.3), Accuracy 100, Penetration 0, CDR 0%, Break Power 10 · monster HP ทั้งตารางถูก tune ให้เข้า TTK เป้าหมายบน baseline นี้ — ทั้งสองเป็น "คู่": ถ้า player baseline เปลี่ยน monster HP ต้อง rescale

สถานะ: Locked

เหตุผล: owner เคาะ 2026-07-13 — เคาะตารางเต็มตาม proposal + ล็อก player baseline เป็น production คู่กัน (ปิด D-049 + D-019); breakPower = guard gauge บอส (ตามที่ตีความ); TTK ตามเสนอทั้งหมด (boss ~2 นาที solo รับ); pattern ท่า elite/boss รอ Kit Proposal แยก
