# Token budget

เพดานการอ่าน **ก่อนเสนอแผน**

## Small (label/knob ค่าเดียว/1 component/แก้ doc)

- อ่าน: entry doc, current-state, 1 context pack, ไฟล์ที่แตะ
- ไม่เกิน 5 ไฟล์ก่อนเสนอแผน ห้าม grep ทั้ง repo — ใช้ CODEMAP

## Medium (panel ใหม่/ระบบย่อย/พฤติกรรมใหม่)

- อ่าน: current-state, feature-map entry, context pack, ไฟล์+เทสต์ของมัน, known-traps ที่ตรง, spec § ที่ feature-map ชี้
- เขียนแผนสั้นก่อนแก้ (ระบบที่แตะ, เทสต์, deploy impact)

## Large (ระบบใหม่/core/schema/refactor ข้าม layer)

- เขียน discovery note ก่อน (มีอะไรอยู่, จะเปลี่ยนอะไร, ความเสี่ยง)
- อ่าน spec § ที่เกี่ยว + context pack แกน
- **owner confirm ก่อนลงมือ** — และถ้าเกิน spec ต้องอัปเดต spec ก่อน

## Always

- `docs/history/` off-budget — อ่านเฉพาะตอน current-state ชี้ไป
- **spec ยาวมาก (v14 มี 60 §) — อ่านเฉพาะ § ที่เกี่ยว ห้ามอ่านทั้งไฟล์**
- cite path อย่า paste เนื้อไฟล์ยาวลงแผน/brief
