# D-053 — Gold แทน grant ตีบวกเดิม (ปิด R5)
- Date: 2026-07-13 · Status: Locked · Supersedes: R5 `PENDING OWNER BALANCE` (D-052) · Relates: D-045, Economy §18.1, Reinforcement doc §3.2/R5

## มติ + เหตุผล (verbatim)

Decision: **แทน grant `Kraeng ×1` เดิม 5 จุด ด้วย Gold (Option A — สเกลตาม milestone)** — Gold **เพิ่มบนคอลัมน์ Gold เดิม** (ไม่ใช่แทนทั้งแถว) · จงใจไม่ตั้ง Gold = มูลค่าเสริมแกร่ง 1 ชิ้น (กัน inflation + รักษา rarity ตาม philosophy §8); ยึด anchor faucet casual 30 นาที gross 300–500 (Economy §14.3) · ทุกแถว one-time per account (§18.2) → bounded

| milestoneId | เฟส | Gold เดิม | +Gold แทน Kraeng×1 | Gold รวมใหม่ |
|---|---|---:|---:|---:|
| `ms_enhancement_ready` | P2 | 100 | +100 | 200 |
| `ach_first_upgrade` | P2 | 0 | +100 | 100 |
| `ms_first_elite` | P2 | 200 | +150 | 350 |
| `ms_map1_complete` | P2 | 300 | +250 | 550 |
| `ms_boss_first_kill` | P2B | 200 | +200 | 400 |

Gold เพิ่มรวม = +600 (P2) + 200 (P2B) ต่อ account · milestone ทั้ง 5 **ไม่แจกเสริมแกร่ง/Kraeng อีกต่อไป** (ไม่มี learning grant) · `questMilestoneTotals.kraeng` และ `bossFirstKillBonus.kraeng` = 0

สถานะ: Locked

เหตุผล: owner เคาะ 2026-07-13 ("Option A ของคุณเป๊ะ ๆ") — สเกลตาม tier ให้ milestone ใหญ่ = รางวัลใหญ่ (pacing); `ach_first_upgrade` เดิม gold 0 → +100 ให้ความสำเร็จแรกมีรางวัลจับต้องได้
