# D-066 — เพิ่มตระกูล Rift Violet เข้า Master Palette (32 → 35 สี)
- Date: 2026-07-13 · Status: Locked · Source: owner แชท 2026-07-13 ("ได้เลย" — รับตามข้อเสนอทั้ง 3 ข้อ)

## มติ

- เพิ่ม 3 เฉด: **Rift Deep `#3E2A78` · Rift Violet `#7B4FCB` (สีหลัก signature) · Rift Light `#B79BEF`** — hue ~265° คั่นกลาง Moon (น้ำเงิน) กับ Corruption (ชมพู) ชัดทั้งสองฝั่ง
- กติกา: Rift = **ตัวเอก signature (ดาบ/สกิล/VFX) + ธีมผนึก/เบาะแสลับ** เท่านั้น · **ห้ามใช้กับ rarity** (V3 เดิม: Sand/Fresh Leaf/Moon/Gold ไม่แตะ) · Corruption ยังสงวน lore
- const ในโค้ด rename `PALETTE_32` → `MASTER_PALETTE` (35 สี)
- re-tint ดาบ/ออร่า `chr_swordsman` จาก Moon → Rift **ทันที** (ลงใน PR #17) · กรอบ rarity + ไอเทม resonant **คง Moon** โดยเจตนา (ม่วง = ตัวเอกเด่นคนเดียว)

**Why:** art-reference ล็อก "ม่วงผนึก Rift Violet = เอกลักษณ์ตัวเอก" แต่ palette 32 สีไม่มีม่วงแท้ — batch 1 ต้องยืมสีน้ำเงินชั่วคราว

Related: [[D-043]] [[D-065]] — implement: `scripts/svg/palette.ts` + Asset Bible §3 amendment (branch `feat/art-map1-svg`, PR #17)
