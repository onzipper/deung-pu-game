# D-070 — นโยบายขาย/ฝาก/ซื้อคืนของบอทในเมือง (PR5 town services)
- Date: 2026-07-16 · Status: Locked (owner แชท 2026-07-16) · Source: owner แชท 2026-07-16 — starter policy ใช้เป็นฐาน

## มติ (เคาะแล้วในแชท — starter policy)

- **ขายอัตโนมัติ:** เฉพาะ item rarity **Common/Uncommon** ที่ไม่ได้สวมใส่และไม่อยู่ใน keep list · **rare ขึ้นไปไม่ขายอัตโนมัติ** — เป็นไปตาม ordinary-rare plan action ของ D-067 (keep+continue/notify/lock/deposit/stop)
- **Denylist กลาง (บังคับทุกแผน):** equipped / quest / unique / critical item **ห้ามขาย-ฝากอัตโนมัติเสมอ**
- **ลำดับใน trip:** `SELLING → DEPOSITING → RESTOCKING` (ขายก่อนได้ทั้งช่องกระเป๋าและ gold → ฝากของที่เก็บ → ซื้อคืนท้ายสุดเพราะต้องใช้ช่องว่างและ gold)
- **ฝาก:** ของที่เหลือนอก keep list ตาม eligibility ของ Storage spec §12 (ของ transaction-locked ฝากไม่ได้ ฯลฯ) · **storage เต็ม → ข้ามการฝาก + รายงานตามจริง** (ไม่ใช่เหตุหยุดแผน)
- **ซื้อคืน (restock):** เติม potion กลับถึงเป้าที่กำหนด · จำกัดยอดจ่ายสูงสุดต่อรอบ · ต้องเหลือ gold ขั้นต่ำเสมอ (ไม่ซื้อจนต่ำกว่า reserve)
- **Idempotency/retry:** ทุกธุรกรรมมี idempotency key ตายตัว retry ได้ 1 ครั้งต่อรายการแล้วข้าม — ล้มเหลวรายรายการไม่ทำให้ trip ล้ม
- **เกณฑ์จบ trip:** กลับ farm แล้วช่องกระเป๋าว่างยังไม่ถึงเกณฑ์ → หยุดด้วย `inventory_full` ตามจริง (รายงานไม่โกหก)
- **Gold ผ่าน ledger ปกติ** (`shop_sell`/`shop_buy`) — audit ได้ครบ ไม่มี ledger reason ใหม่ · บอทห้าม trigger achievement จากธุรกรรมในเมือง

## ค่าตัวเลขที่ lock 2026-07-16 (ทั้งหมดเป็น Design Knobs ปรับทีหลังได้)

- `sellRarityMax` = uncommon · `keepItemIds` = [`con_small_potion`] · `potionRestockTarget` = 5 (เท่า starter loadout) · `minGoldReserve` = 50 (potion ขวดละ 18) · `resumeMinFreeSlots` = 5 (จากกระเป๋า 40 ช่อง) · `maxTxRetries` = 1
- Phase A knobs lock พร้อมกัน: `maxDeathRecoveriesPerSession` = 3 · `pocketFallbackIdleDecisions` = 3 · `preferAssignedPocket` = true

## ผลต่อเอกสารเดิม

- ทำงานคู่กับ [D-069](D-069-bot-town-warp.md) (warp) — นโยบายนี้มีผลเฉพาะเมื่อตัวละครอยู่ city-hub จริง
- Storage spec §12 (eligibility ฝาก) และ Economy spec §7 (ราคาซื้อ-ขาย) ยัง Locked — D-070 เป็นนโยบายผู้ใช้บริการ ไม่แก้ราคา/กติกาเดิม
