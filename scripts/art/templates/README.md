# Art contract — ตัวละครมาตรฐาน (ที่เดียวจบ)

Template: `chr_standard.atlas.json` + `chr_standard.manifest.json` — copy แล้วแก้ 2 ค่า:
`assetId` (manifest) + `image` (atlas) เป็น `chr_<ชื่อใหม่>` · ติดตั้งที่ `public/assets/atlases/` + `public/assets/manifests/`

owner ส่ง atlas/manifest มาเองก็ได้ — ระบบเป็น data-driven (frameSize/pivot ตามไฟล์) ขอแค่ชื่อ field ตาม schema `src/engine/assets/atlas-format.ts` และมี idle/walk/attack ครบ 5 ทิศ + mirrorMap

## Contract ตัวเลขมาตรฐาน (ตรงกับ template)

| เรื่อง | ค่า |
|---|---|
| เฟรม | 96×96 px · sheet 576×1440 = 6 คอลัมน์ × 15 แถว |
| แถว | idle×(s,sw,w,nw,n) 2 เฟรม → walk×5 ทิศ 6 เฟรม → attack×5 ทิศ 5 เฟรม · ช่องเหลือโปร่งใสสนิท |
| ตำแหน่ง | เท้าแตะ y = pivot[1] (81) ±2 ทุกเฟรม · ยืนสูง 76-80px · ห้ามชนขอบช่อง |
| ทิศ | sw/w/nw หันซ้ายของภาพ · nw = หลังเฉียง ห้ามเห็นหน้าเต็ม · ห้ามทิศเพี้ยนกลางแถว |
| movement | walk คู่เฟรมติดกัน ≥15% + ก้าวสลับ ≥30% · attack ต่างจาก idle ≥25% |
| อาร์ต | identity ตรง reference ทุกเฟรม · ห้ามหุ่นวาดด้วยโค้ด · อาร์ตต้อง gen ด้วย image model เท่านั้น |

## เครื่องมือ (วิธีใช้อยู่หัวไฟล์)

`fix-sprite-png.mjs` ซ่อมพื้นหลอก+ขนาด · `check-sprite-sheet.mjs` ตัดสินตาม contract · `verify-atlas.ts` ตรวจกับ engine parser จริง

## นโยบายซ่อม (2026-07-16)

ซ่อมเชิงกลได้เลยไม่ต้องถาม แล้วรายงานว่าซ่อมอะไร: ลอกพื้น, resize, crop เฟรมเกิน, จัด scale/baseline ให้ลงช่อง, relabel ทิศ+สลับ mirrorMap
ตีกลับ AI ต้นทางเฉพาะที่ต้องวาดใหม่: ทิศวาดผิด, identity เพี้ยน, ขาไม่ก้าวจริง, ท่าผิด
