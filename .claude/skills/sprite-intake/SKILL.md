---
name: sprite-intake
description: >
  รับ sprite sheet จาก AI ภายนอก (ChatGPT/Gemini) เข้าเกม: ตรวจไฟล์ → ซ่อมทุกอย่างที่ซ่อมได้
  ด้วยเครื่องมือ → ส่ง art-inspector (sonnet) ตรวจเต็มชุด → ผ่านติดตั้ง+commit /
  ไม่ผ่านร่างข้อความตีกลับเฉพาะเรื่องที่ต้องวาดใหม่. ใช้เมื่อ owner ส่งไฟล์ภาพมา หรือพิมพ์ /sprite-intake.
---

# /sprite-intake — ด่านรับอาร์ต AI เข้าเกม

Orchestrator ทำหน้าที่ จัดไฟล์ → ซ่อม → ส่ง brief → อ่าน verdict → ติดตั้ง/ตีกลับ
**งานตรวจอยู่กับ subagent `art-inspector` (sonnet — งาน vision+checklist ไม่เปลือง opus)**

**Contract + template + นโยบายซ่อม = `scripts/art/templates/README.md` ที่เดียว** — วางตาราง contract ทั้งตารางลงใน brief ทุกครั้ง

## ขั้นตอน

1. **หาไฟล์**: (ก) `art-incoming/` ที่ repo root — กล่องรับทางการของ owner (git-ignored) **ห้าม restore/ลบไฟล์ในนั้น** (ข) `C:\Users\PC\.claude\uploads\...` (ค) ตรวจซ้ำ: hash เทียบของเดิมเสมอ — ไฟล์ซ้ำ = จบเลย ไม่ต้อง spawn agent · owner ส่ง atlas/manifest มาด้วยได้ — ใช้ของที่ส่งมา (ตรวจชื่อ field ตาม `src/engine/assets/atlas-format.ts`) ไม่ส่งมาก็ clone จาก template
2. **ซ่อมก่อนตรวจ** (ทำเลย ไม่ต้องถาม — จดทุกอย่างที่ซ่อมไว้รายงาน): `fix-sprite-png.mjs` ลอกพื้น/resize · crop เฟรมเกิน · จัด scale/baseline ให้ลงช่อง · relabel ทิศ+สลับ mirrorMap
3. **Spawn `art-inspector`** — brief ตาม Brief contract (.claude/README.md): FILES (png ซ่อมแล้ว + atlas + manifest + reference identity) + CONTEXT (ตาราง contract จาก templates/README.md) + เครื่องมือ `check-sprite-sheet.mjs` (--strips ดูตาทุกแถว) + TESTS (exit 0 + verdict PASS/REJECT)
4. **PASS** → ติดตั้ง PNG+atlas+manifest ลง `public/assets/**` → `npx tsx scripts/art/verify-atlas.ts <assetId>` → `npx vitest run tests/engine-assets-collect.test.ts tests/engine-config-snapshot.test.ts` → commit บน branch ปัจจุบัน → รายงาน owner ว่าซ่อมอะไรไปบ้าง · asset id ใหม่ตัวแรก → ลงทะเบียน config (`src/engine/config/player.ts` DEFAULT_PLAYER_ANIMATION_CONFIG.style.assetId เป็นตัวอย่างฝั่งผู้เล่น)
5. **REJECT** (เฉพาะเรื่องที่ซ่อมไม่ได้: ทิศวาดผิด, identity เพี้ยน, ขาไม่ก้าว, ท่าผิด) → เกมคงเวอร์ชันเดิม (แจ้ง owner ชัดๆ ว่าในเกมคือเวอร์ชันไหน) → ตาราง defect + ร่างข้อความตีกลับ AI ต้นทาง (ไทย สั้น ชี้เฉพาะข้อ + กติกาที่ห้ามเปลี่ยน)

## Traps สะสม (เตือน agent ใน brief เสมอ)

1. AI ส่งไฟล์เดิมซ้ำทั้งที่บอกว่าแก้แล้ว → hash ก่อนเสมอ
2. พื้นหลอก/ขนาดเพี้ยน/เฟรมเกิน/ทิศ label สลับ → ซ่อมฝั่งเรา ไม่นับ defect ไม่ตีกลับ
3. วาดตัวละครด้วยโค้ด (หุ่นหน้าเปล่า/เรขาคณิต/ค่า QA เหมือนกันทุกทิศเป๊ะ) → REJECT ทันที
4. ทิศหันข้างกลับด้าน / nw เห็นหน้า / ทิศเพี้ยนกลางแถว → ดู strips ทุกแถว
5. walk ขาไม่ก้าว (เฟรมต่างแค่ผ้าพลิ้ว) → เครื่องวัด movement + ยืนยันด้วยตา
