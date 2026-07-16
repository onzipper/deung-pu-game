---
name: sprite-intake
description: >
  รับ sprite sheet จาก AI ภายนอก (ChatGPT/Gemini) เข้าเกม: ตรวจไฟล์ → ซ่อมพื้น/ขนาด →
  ส่ง art-inspector (sonnet) ตรวจเต็มชุด → ผ่านติดตั้ง+commit / ไม่ผ่านร่างข้อความตีกลับ.
  ใช้เมื่อ owner ส่งไฟล์ภาพตัวละคร/มอนสเตอร์ใหม่มา หรือพิมพ์ /sprite-intake.
---

# /sprite-intake — ด่านรับอาร์ต AI เข้าเกม

Orchestrator ทำหน้าที่แค่ จัดไฟล์ → ส่ง brief → อ่าน verdict → ติดตั้ง/ตีกลับ
**งานตรวจทั้งหมดอยู่กับ subagent `art-inspector` (sonnet — งาน vision+checklist ไม่เปลือง opus)**

## Contract กลาง (ตัวเลขมาตรฐานตัวละคร — ใส่ใน brief ทุกครั้ง)

| เรื่อง | ค่า |
|---|---|
| เฟรม | 96×96 px · sheet ตาม atlas.json (ตัวละครมาตรฐาน 576×1440 = 6 คอลัมน์ × 15 แถว) |
| แถว | idle×(s,sw,w,nw,n) 2 เฟรม → walk×5 ทิศ 6 เฟรม → attack×5 ทิศ 5 เฟรม · ช่องเหลือโปร่งใสสนิท |
| ตำแหน่ง | เท้าแตะ y = pivot[1] (81) ±2 ทุกเฟรม · ยืนสูง 76-80px · ห้ามชนขอบช่อง |
| ทิศ | sw/w/nw หันซ้ายของภาพ · nw = หลังเฉียง ห้ามเห็นหน้าเต็ม · ห้ามทิศเพี้ยนกลางแถว |
| movement | walk คู่เฟรมติดกัน ≥15% + ก้าวสลับ ≥30% · attack ต่างจาก idle ≥25% (เครื่องวัดใน check-sprite-sheet) |
| อาร์ต | identity ตรง reference ทุกเฟรม · ห้ามหุ่นวาดด้วยโค้ด · alpha แท้ (พื้นหลอกซ่อมได้ ไม่นับ defect) |

## ขั้นตอน

1. **หาไฟล์**: repo path (`public/assets/atlases/chr_*.png` แก้โดย owner) / `C:\Users\PC\.claude\uploads\...` (zip → แตกลง scratchpad) — ก่อนอื่น `git status` + hash เทียบของเดิมเสมอ (ไฟล์ซ้ำ = จบเลย ไม่ต้อง spawn agent)
2. **Spawn `art-inspector`** ด้วย brief ตาม Brief contract (.claude/README.md):
   - FILES: path png/atlas/manifest ที่จะตรวจ + path เวอร์ชันก่อนหน้า (เทียบ hash) + reference identity
   - CONTEXT: ตาราง contract ข้างบน (วางทั้งตาราง) — ไม่ต้องให้อ่าน docs อื่น
   - SPEC: `docs/context/engine.md` §atlas ไม่ต้องอ่าน — เครื่องมือคือ `scripts/art/{fix-sprite-png,check-sprite-sheet}.mjs` + `verify-atlas.ts` (วิธีใช้อยู่ในหัวไฟล์)
   - TESTS: `node scripts/art/check-sprite-sheet.mjs ... ` exit 0 + verdict ตาม format ใน persona
3. **อ่าน verdict**:
   - **PASS** → ติดตั้ง: PNG (ผ่าน fix แล้ว) + atlas.json + manifest.json ลงตำแหน่งจริง →
     `npx tsx scripts/art/verify-atlas.ts <assetId>` ซ้ำหนึ่งครั้งกับไฟล์จริง →
     `npx vitest run tests/engine-assets-collect.test.ts tests/engine-config-snapshot.test.ts` →
     commit (**ห้าม push จนกว่า owner สั่ง**) → อัพเดท memory art track
   - **REJECT** → คืนไฟล์เกมเป็นเวอร์ชันดีล่าสุด (`git checkout -- <paths>`) → รายงาน owner:
     ตาราง defect + **ร่างข้อความตีกลับ AI ต้นทาง** (ภาษาไทย สั้น ชี้เฉพาะข้อที่พลาด + กติกาที่ห้ามเปลี่ยน)
4. asset ใหม่ตัวแรกของ id ใหม่ → อย่าลืมงานฝั่งโค้ด: เพิ่ม/สลับ `assetId` ใน config
   (ตัวอย่างผู้เล่น: `src/engine/config/player.ts` DEFAULT_PLAYER_ANIMATION_CONFIG.style.assetId)

## Traps สะสม (จาก memory chatgpt-sprite-art-track — เตือน agent ใน brief เสมอ)

1. AI ส่งไฟล์เดิมซ้ำทั้งที่บอกว่าแก้แล้ว → hash ก่อนเสมอ
2. พื้นหลอก (หมากรุก/ขาวทึบ 100%) → fix-sprite-png จัดการ ไม่ใช่ defect
3. วาดตัวละครใหม่ด้วยโค้ด (หุ่นหน้าเปล่า/เรขาคณิต) → REJECT ทันที
4. ทิศหันข้างกลับด้าน / nw กลายเป็นหันหน้า / ทิศเพี้ยนกลางแถว → ดู strips ทุกแถว
5. walk ขาไม่ก้าว (เฟรมต่างกันแค่ผ้าพลิ้ว) → เครื่องวัด movement จับ + ยืนยันด้วยตา
