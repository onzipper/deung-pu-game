# ดึ๋งปุ๊ — Game Design Principles

> ไฟล์: `deungpu_GAME_DESIGN_PRINCIPLES_v1.md`  
> สถานะ: **v1.0 — Owner-delegated production baseline**  
> โปรเจกต์: **ดึ๋งปุ๊ — True 2D Isometric Web MMORPG**  
> Canonical references: `deungpu_project_checkpoint_v15_p0_scope_lock_ready.md`, `deungpu_technical_architecture_v1_5_p0_scope_lock.md`, `deungpu_ENGINE_FOUNDATION_DECISIONS_v1.md`, `deungpu_MAP_LAYOUT_BIBLE_v1.md`, `deungpu_MAP_SCALE_AND_SPAWN_DENSITY_SPEC_v1.md`  
> วัตถุประสงค์: เป็นเข็มทิศสำหรับตัดสิน feature ใหม่ให้ยังเป็นดึ๋งปุ๊ แม้ทีมและเวลาจะเปลี่ยน

---

# 1. ทุกการเล่นต้องทิ้งความคืบหน้า
ผู้เล่นควรได้ progress, knowledge, clue, mastery หรือ social memory แม้ไม่ได้ของหายาก

ห้าม: session ที่เสียเวลาเพราะ RNG ล้วนโดยไม่มี pity/knowledge/value

# 2. ความสะดวกซื้อได้ แต่ชัยชนะซื้อไม่ได้
Plus/Pro ขายเวลา ข้อมูล ความต่อเนื่อง และ automation ที่มี guardrail

ห้าม: ซื้อ stat, guaranteed legendary power, PvP advantage

# 3. Bot คือผู้ช่วย ไม่ใช่ผู้แทนเจ้าของ
Bot ทำงานซ้ำ วิเคราะห์ และรายงาน แต่ไม่ตัดสินใจ secret/rare/legendary/high-value action

# 4. โลกต้องอบอุ่นก่อนจึงจะน่ากลัวได้
ต้นเกมสร้างบ้าน ผู้คน และความคุ้นเคย เพื่อให้ความลึกลับ/รอยแยกมีน้ำหนัก

# 5. ความกาวมีจังหวะ
อารมณ์ขันมาจาก animation, timing, ชื่อ และพฤติกรรม ไม่ยัด joke ทุกหน้าจอ

# 6. ผู้เล่นต้องอ่านสนามได้ก่อนรู้สึกสะใจ
telegraph, target, danger และ route สำคัญกว่า particle

# 7. Juice อยู่ client, Truth อยู่ server
ภาพ/เสียงต้องตอบสนองเร็ว แต่ damage/drop/value ต้องตรวจสอบได้

# 8. Shared world เป็นค่าเริ่มต้น
field map ควรมีคนอื่นให้เห็นและร่วมโลก; private instance ใช้เมื่อ content ต้องการจริง

# 9. ความลับต้องให้ร่องรอย
secret ไม่ควรเป็น random invisible trigger; ผู้เล่นสังเกต เรียนรู้ และเล่าต่อได้

# 10. Failure ต้องสอนหรือสร้างเรื่องเล่า
ตาย/ตีบวก fail/พลาด event ต้องมี feedback, recovery และเหตุผลอ่านออก

# 11. Economy เป็นระบบนิเวศ
ทุก source ต้องมี sink, ทุก reward ต้องมี telemetry, ทุก high-value mutation ต้อง audit

# 12. Data-driven ก่อน content scale
เพิ่ม map/skill/monster ผ่าน config/manifest ไม่ fork logic รายชิ้น

# 13. Mobile เป็นผู้เล่นจริง ไม่ใช่โหมดลดรูป
touch/readability/performance เป็น acceptance gate

# 14. Performance คือ game design constraint
ถ้าฝูง 60 ตัวทำให้เกมอ่านไม่ออก/กระตุก ต้องลดหรือออกแบบใหม่ ไม่ฝืนด้วยคำว่า optimize ทีหลัง

# 15. Progressive complexity
ต้นเกมโชว์สิ่งจำเป็น, ปลดระบบลึกตามบริบท; ไม่โยน 10 stat/market/bot config พร้อมกัน

# 16. Reward ต้องสื่อความหมาย
ของหายากต่างด้วย silhouette, source, story, sound และ use case ไม่ใช่สีกรอบอย่างเดียว

# 17. Living World ห้ามสร้าง FOMO รุนแรง
event ช่วยให้โลกมีชีวิต แต่ไม่ทำให้พลาดครั้งเดียวเสีย power ถาวร

# 18. ทุก feature ต้องมี rollback/disable path
ระบบ live ที่ปิดไม่ได้คือความเสี่ยง ไม่ใช่ความกล้า

---

# Feature Decision Test

Feature ใหม่ต้องตอบ “ใช่” อย่างน้อย 6/8:
1. เสริม core fantasy นักล่า/โลกสั่นพ้องไหม
2. สร้าง progress ที่ผู้เล่นเข้าใจไหม
3. ไม่ซื้อชัยชนะใช่ไหม
4. อ่านได้บน mobile ไหม
5. data-driven/configurable ไหม
6. audit/rollback ได้ไหม
7. ไม่ทำลาย shared-world/social feel ไหม
8. มี content/operational cost สมเหตุผลไหม

ถ้าไม่ผ่านข้อ 3, 4 หรือ 6 ให้ reject/ออกแบบใหม่ทันที

---

# Anti-Patterns

- feature เพราะเกมอื่นมี
- currency ใหม่โดยไม่มี sink/use loop
- bot ทำ high-value decision
- map recolor without new play rhythm
- boss เป็นมอน HP เยอะอย่างเดียว
- paid tier แก้ pain ที่เราจงใจสร้าง
- popup แทน world storytelling
- secret ที่ community ต้อง datamine เท่านั้น
- tech hardcode balance เพื่อส่งเร็ว
