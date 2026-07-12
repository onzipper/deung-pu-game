# D-045 — Economy & Loot Map 1 baseline
- Date: 2026-07-12 · Status: Locked (baseline) · **E1/E2 RESOLVED + E3 OPEN 2026-07-12 (ดู 4 แถวล่างสุด)** · Source row: docs/decision-index.md (2026-07-13 extraction)

## มติ + เหตุผล (verbatim)

Decision: **Economy & Loot Map 1 = locked baseline** (`docs/design/deungpu_P2_MAP_1_ECONOMY_AND_LOOT_SPEC_v1.md`) — item master 4 tier + drop tables ทุกมอน + ร้าน starter 6 รายการ + EXP curve/level-diff/party pool + แหล่งแกร่ง (milestone 4 + drop % + elite/boss guaranteed) + config-first 11 ไฟล์/multiplier default 1.0 · **สอดคล้อง**: monetization guardrails (ไม่แตะ premium), gold=character-bound, Kraeng=item ไม่ใช่ currency · **implementation decisions (tech)**: EXP grant+level-up = อยู่ใน P2-09 (reward grant) · เพิ่ม `LedgerReason` shop_buy/shop_sell + `ItemInstance.crackedAt` ใน schema (ยังฟรีถึง P2-16) · dropTableVersion Int ↔ economyVersion string ผ่าน ConfigVersion mapping · ตัวอย่าง `bindType` per-instance ในเล่ม = อ่านจาก config ตาม S3 (ไม่เพิ่ม column) · **⚠ ค้างเคาะ E1–E3**: (E1) boss "ผู้พิทักษ์เสียงสะท้อน"/elite "หมูป่าพองคลั่ง" ในเล่มนี้ vs canon เดิม "หมูป่าหม้อเดือด"/"ดึ๋งปุ๊จอมพลัง" (Lore/Map/Asset Bible + Balance Proposal ยังยึดชื่อเดิม) (E2) ตาราง % ตีบวก §16.2 ต่างจาก GS §12 ทุกขั้น + **นิยาม "แกร่ง" ชนกัน**: GS = item การันตี +1 100% / เล่มนี้ = วัสดุจ่ายทุกครั้งที่ตีแล้วยัง fail ได้ (E3) stat row นกจิกปุ๊/หมูป่า ยังไม่ถูกส่ง (เงื่อนไข Bible 1.3 ก่อน content freeze) — E1–E3 block เนื้อหา P2-09/10 ไม่ block ระบบ

สถานะ: Locked (baseline) · **E1/E2 RESOLVED + E3 OPEN 2026-07-12 (ดู 4 แถวล่างสุด)**

เหตุผล: owner ส่งเล่ม 2026-07-12
