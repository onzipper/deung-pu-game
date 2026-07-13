# D-065 — Production path: เสียง JS งบ 0 + art ①② + Open Beta = Map 1
- Date: 2026-07-13 · Status: Locked · Source: owner แชท 2026-07-13

## เสียง (ปิด L5)

SFX = **ZzFX/jsfxr** (generate จากโค้ด, ของเราเอง 100% ไม่มีปัญหา license) · เพลง = **chiptune ผ่าน ZzFXM/Tone.js** ใช้ถึง Closed Alpha+ · งบ 0 — เพลง original 8 ชิ้น (Bible §5.1) เลื่อนไม่มีกำหนด จนกว่า owner สั่งตั้งงบ

## Art path (ปิดคำถาม ①②③)

- เอา **① pixelate filter** (render ต่ำ + nearest-neighbor ทั้งเกมดูเป็น pixel art — ไม่ขัด D-042 SVG-first) + **② owner gen ภาพ → ท่อ import sprite** — ② **ไม่มีกำหนดส่ง ไม่ block อะไร**: owner ยังไม่สะดวก gen ช่วงนี้, ไปถึง Open Beta ด้วย filter+SVG จากโค้ดได้, Art Readiness Gate (D-040) owner ตัดสินจากของจริงตอนนั้น, ภาพส่งมาเมื่อไหร่เสียบเพิ่มทีละชิ้น · ③ (skill ฝึก AI วาด) ยังไม่เอา

## Open Beta scope (re-scope launch gates ใน D-040)

**Open Beta = ระบบครบ + Map 1 เท่านั้น** — แมพ 2–10 ทยอย develop แล้วปล่อยหลัง beta เป็นรอบ ๆ (ไม่ต้องครบ 1→4→7→10 ก่อนเปิด)

## ความเสี่ยงที่ rebrief แล้ว owner ยืนยัน "ทราบแล้ว ยังไม่ทำอะไรเพิ่ม"

Render free tier จนพังจริง ([[D-058]]) + DB เดียวไม่มี backup จนหลัง Open Beta ([[D-057]] [[D-059]]) — ห้าม escalate ซ้ำจนกว่าจะ "พังจริง"

Related: [[D-040]] [[D-042]]
