# D-039 — Account/Character/Storage spec locked (S1-S4)
- Date: 2026-07-12 · Status: Locked · Source row: docs/decision-index.md (2026-07-13 extraction)

## มติ + เหตุผล (verbatim)

Decision: **Account/Character/Storage spec = locked** (`docs/design/deungpu_ACCOUNT_CHARACTER_STORAGE_FLOW_SPEC_v1.md`) + คำเคาะ S1–S4: **S1** schema รองรับครบตอนคลื่น 2 (item location 7 แบบ, storage/delivery/session tables — DB ยังว่างแก้ฟรี), Storage+Delivery UI = **คลื่น 3 (P2-17)** · **S2 ตัวละคร 5 ช่อง/บัญชี** เปิดครบแต่แรก ไม่มี paid unlock (supersede baseline "1 ตัว" ใน UI spec §7.1) · **S3** bind/storage/trade policy = static ต่อชนิดใน **config**; `expiresAt`/`uniqueEquipGroup` = per-instance ใน DB · **S4 Game Hub = route ใน Next.js app เดิม** ไม่ใช่เว็บแยก · กติกาชื่อ: 3–16 ตัว ไทย/อังกฤษ/เลข unique global case-insensitive NFC, ห้าม rename/delete ใน P2/P2B · 1 active session/บัญชี + takeover flow · inventory 40/ตัว · คลังบัญชี 200 ช่อง shared · Delivery Box 50 + expiry ตามชนิด (เตือน 7 วัน/1 วัน ห้ามหายเงียบ) · gold = character-bound ใน P2

สถานะ: Locked

เหตุผล: owner เคาะ S1–S4 2026-07-12
