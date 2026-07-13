# D-054 — Enhancement stat multiplier +6..+15 production (ปิด R9)
- Date: 2026-07-13 · Status: Locked · Supersedes: R9 placeholder linear `PENDING OWNER BALANCE` (D-052) · Relates: D-048 (เพดาน +15), Economy §16.3, Reinforcement doc §2.1/R9

## มติ + เหตุผล (verbatim)

Decision: **multiplier +6..+15 = Option A (ต่อ curve เดิม, delta เร่ง +0.01/ระดับ)** — ต่อจาก +0..+5 (1.00→1.35, delta +0.05→+0.09) โดย delta ระดับถัดไปเพิ่มทีละ +0.01 ต่อเนื่อง · ยืนยัน rule "minimum increase +1 เมื่อข้ามระดับที่ multiplier เพิ่ม" (§16.3) ใช้ต่อกับ +6..+15

| Enhancement | Multiplier | (delta) |
|---:|---:|---:|
| +5 | 1.35 | — |
| +6 | 1.45 | +0.10 |
| +7 | 1.56 | +0.11 |
| +8 | 1.68 | +0.12 |
| +9 | 1.81 | +0.13 |
| +10 | 1.95 | +0.14 |
| +11 | 2.10 | +0.15 |
| +12 | 2.26 | +0.16 |
| +13 | 2.43 | +0.17 |
| +14 | 2.61 | +0.18 |
| +15 | 2.80 | +0.19 |

Apply per eligible stat (Attack/Defense/Max HP/Break Power): `Enhanced Stat = floor(Base Stat × Multiplier)` · Critical Chance / Move Speed ไม่ scale (§6.2 ไม่เปลี่ยน)

สถานะ: Locked

เหตุผล: owner เคาะ 2026-07-13 (Option A) — ต่อ curve ตาม DNA เดิมอย่างเป็นธรรมชาติ ไม่ reset; เพดาน +15 ≈ ×2.80 = power statement สมกับการลงทุน long-term chase (~3.5 เดือน/ชิ้น ตาม R4) ตรง pillar "ตีบวกมีเรื่องขิง/การล่าคุ้มค่า" (§8) · trade-off ที่ยอมรับ: multiplier นี้ global (ทุกอุปกรณ์/ทุกแมพ) → ต้องระวัง balance content ปลายทาง
