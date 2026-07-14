# ดึ๋งปุ๊ — P3 Bot & Report UI Implementation Spec

> **ไฟล์:** `deungpu_P3_BOT_AND_REPORT_UI_IMPLEMENTATION_SPEC_v1.md`
> **สถานะ:** `LOCKED for implementation (owner-delegated 2026-07-14)` — owner มอบให้ game-designer author เล่มที่ P2B §7 ระบุชื่อไว้แต่ยังไม่เคยเขียน
> **supersedes:** — (เล่มใหม่ ไม่ทับของเดิม)
> **relates:** `deungpu_OWNER_PRODUCTION_DECISIONS_P2B_TO_LAUNCH_v1.md` §6/§7/§8 · `docs/decisions/D-063-bot-economy-final.md` · `docs/decisions/D-035-not-bot-a.md` · `docs/decisions/D-037-autopilot.md` · `deungpu_MAP_SCALE_AND_SPAWN_DENSITY_SPEC_v1.md` §8/§11 · `deungpu_P2_UI_VISUAL_IMPLEMENTATION_SPEC_v1.md` (panel system, `--dp-*` tokens, HUD button)
> **ขอบเขต:** UI/UX + client↔server message contract ของระบบ Bot (Hunter Assistant) และหน้ารายงาน — **ไม่ครอบ** runtime/anti-abuse ฝั่ง server (แยกไป tech doc)
> **หลักการค่า:** ทุกค่าใน spec นี้ที่เป็นตัวเลข/threshold = **Design Knob (v15 §48)** อ่านจาก config เท่านั้น — ค่าที่ยังไม่ได้เคาะ mark `PENDING OWNER`

---

# 0. ขอบเขตและหลักการ

## 0.1 Bot คืออะไร / ไม่ใช่อะไร

- **Bot = Hunter Assistant (D-035, "Bot A")** — ระบบ automation ที่ผู้เล่นตั้งกฎล่วงหน้าให้เล่นฟาร์มแทนในเส้นทางที่ปลอดภัย รันฝั่ง server ต่อได้แม้ปิดแท็บ
- **แยกเด็ดขาดจาก 2 ระบบนี้ — ห้ามปน UI/สื่อสาร:**
  - **ดึ๋งๆ = companion/guidance (D-035, D-037)** — ไม่สู้ ไม่ฟาร์ม ไม่ตัดสินใจแทน · ดึ๋งๆ เป็นได้แค่ presentation layer ที่ "เปิดบท" micro-tutorial ตอนปลดล็อก Bot ครั้งแรก
  - **Auto Pilot = auto-walk (D-037)** — เดินไปเป้าที่ผู้เล่นยืนยันเอง หยุดทันทีเมื่อเข้า combat/แท็บ background · **ไม่กิน bot tier · ไม่ข้ามเส้น "backgrounding ≠ bot"**
- UI copy ห้ามเรียก Auto Pilot ว่า "บอท" และห้ามเรียก Bot ว่า "ออโต้ไพลอต" — คนละปุ่ม คนละ panel คนละสิทธิ์

## 0.2 หลักเศรษฐกิจที่ UI ต้องบังคับ (D-063, §6.1, §8.3)

- Bot **ขายความสะดวก** เท่านั้น: เวลา · continuity · report · rules · history · alerts · presets · schedule
- Bot **ห้ามขาย power**: stat · drop rate · EXP multiplier · boss auto-clear · secret/rare decision · PvP advantage
- ทุก tier **runtime เท่ากัน (24/7 ไม่จำกัดชั่วโมง รวม Free)** — ความต่าง = **ความสามารถ** (profiles/rules/retention/notifications/schedules/analytics)
- Bot efficiency เทียบ manual expert = `botEfficiency.versusEfficientManual` min 0.60 / target 0.70 / max 0.80 (§6.2) — manual ต้องดีกว่าเสมอ · UI **ห้าม**เคลมว่าบอทเก่งกว่าเล่นเอง

---

# 1. Information Architecture

Entry point เดียว: **HUD button "ผู้ช่วยนักล่า" (Bot)** (ตาม HUD button pattern) → เปิด **Bot Hub panel**. ทุก sub-panel เปิดจาก Hub.

| # | Panel | Purpose | เปิดจาก |
|---|---|---|---|
| P0 | Bot Hub | สถานะรวม + ปุ่มเข้าแต่ละส่วน + tier ปัจจุบัน | HUD button |
| P1 | Setup Wizard | สร้าง/แก้ profile: map → pocket (bot-safe) → base preset | Hub "สร้างงานใหม่" |
| P2 | Rule Builder | กฎ skill/potion/loot ต่อ profile | Setup ขั้น 4 / Hub "แก้กฎ" |
| P3 | Stop Conditions | แสดง 9 ข้อบังคับ (read-only) + custom เพิ่มได้ | Setup ขั้น 5 / Hub |
| P4 | Schedule | ตั้งเวลาเริ่ม/หยุดอัตโนมัติ (Plus/Pro) | Hub "ตั้งเวลา" |
| P5 | Live Status | กำลังทำอะไร/ที่ไหน/ฆ่าไปกี่ตัว realtime | Hub เมื่อ running |
| P6 | Report Summary | สรุปผลต่อ session/วัน | Hub "รายงาน" |
| P7 | Report Detail | ไล่รายวัน/รายการ ตาม retention tier | Report Summary → เลือกวัน |
| P8 | Rare Alert | แจ้งเจอของแรร์/high-value → บอทหยุด | toast + Hub badge |
| P9 | Error / Recovery | บอทหยุดผิดปกติ + วิธีแก้ | toast + Hub state |
| P10 | Tier Comparison + Upgrade | เทียบ Free/Plus/Pro + ปุ่มซื้อ pass | จุด locked เท่านั้น (non-pushy) |

**UI foundation:** ทุก panel ใช้ panel system เดิม (Desktop = float panel ≤360px, ขวาใต้ minimap · Mobile = fullscreen sheet / bottom sheet), สี `--dp-*` tokens, ปุ่ม HUD/CTA ตาม `deungpu_P2_UI_VISUAL_IMPLEMENTATION_SPEC_v1.md`.

---

# 2. P0 — Bot Hub panel

- **Purpose:** จุดศูนย์กลาง — เห็นสถานะบอททุกตัวใน 1 หน้าจอ
- **Layout:** header (tier chip + ป้ายหมดอายุ) → รายการ profile (card ต่อ 1 profile: ชื่อ, map/pocket, สถานะ, ปุ่ม start/stop) → footer ปุ่ม "สร้างงานใหม่" (disable + locked hint เมื่อถึงเพดาน profiles ของ tier)
- **ข้อมูลที่แสดง/แก้ได้:** ชื่อ profile (แก้ได้), สถานะ realtime, สรุปสั้น (ฆ่า/ชม., gold/ชม.), ปุ่มเข้า Rule/Schedule/Report ต่อ profile
- **ป้ายหมดอายุ (D-063):** วันที่เต็มเสมอ · เพิ่ม countdown เมื่อเหลือ < 24 ชม. — **ห้าม**ใส่ countdown เร่งเร้าเมื่อยังเหลือเยอะ (ดู §14)
- **States:**
  - `empty` — ยังไม่มี profile → ปุ่มใหญ่ "สร้างงานแรก" + ลิงก์ micro-tutorial (§12.1)
  - `idle` — มี profile แต่ยังไม่รัน
  - `running` — อย่างน้อย 1 profile รันอยู่ → card เด่น + ทางลัดไป Live Status
  - `stopped` — เพิ่งหยุด → แสดงเหตุผลหยุด (map จาก stop condition ไหน)
  - `error` — ดู §10
  - `expired-fallback` — pass หมด → banner "ตอนนี้เป็น Free" + profile/rule ส่วนเกิน pin เป็น read-only (§12.4)
- **Tier gating:** ปุ่ม "สร้างงานใหม่" นับ profiles ต่อ tier (1/3/10) · ปุ่ม Schedule/Analytics ขึ้น locked icon ตาม tier
- **Mobile:** fullscreen sheet, profile เป็น list การ์ดแนวตั้ง, footer ปุ่ม fixed

---

# 3. P1 — Setup Wizard

- **Purpose:** สร้าง profile ให้ปลอดภัยตั้งแต่ต้น — บังคับเลือกเฉพาะพื้นที่ bot-safe
- **Layout:** wizard 5 ขั้น (Desktop = stepper แนวนอน · Mobile = ทีละ full sheet + ปุ่ม ถัดไป/ย้อน)
  1. **เลือก map** — เฉพาะ map ที่ปลดล็อกแล้ว
  2. **เลือก pocket** — แสดงเฉพาะ **allowed-pocket / bot-safe route** (Map spec §8.1, §11) · boss/secret/event pocket = **ไม่แสดงเป็นตัวเลือกเด็ดขาด** (forbidden เสมอ) · แต่ละ pocket โชว์ density แนวโน้ม + "กลับเมืองชัด"
  3. **base preset** — เลือกสำเร็จรูป (เช่น "ฟาร์มเซฟ AoE") ที่ prefill Rule Builder
  4. **Rule Builder** (→ §4)
  5. **Stop Conditions** (→ §5) → ยืนยันสร้าง
- **ข้อมูลที่แก้ได้:** ชื่อ profile, map, pocket, preset, กฎ, stop เสริม
- **States:** `new` (ค่าเริ่ม), `editing` (แก้ profile เดิม), `blocked` (ถึงเพดาน profiles → ขั้นสุดท้าย disable + Upgrade CTA เฉพาะจุด)
- **Tier gating:** ถ้าเลือก preset/rule เกินจำนวน rule ของ tier → เตือนตอนขั้น 4
- **Mobile:** ทีละขั้นเต็มจอ, map/pocket เป็น list เลือกง่าย

---

# 4. P2 — Rule Builder

- **Purpose:** ตั้งพฤติกรรมบอทแบบ declarative — จำนวนกฎถูก cap ตาม tier (3/10/25)
- **Layout:** 3 กลุ่ม (accordion): **Skill usage · Potion · Loot filter** + แถบนับ "ใช้กฎไป X/Y" ค้างบนสุด
- **ข้อมูลที่แสดง/แก้ได้:**
  - **Skill usage** — ต่อสกิลใช้ field `botUsageRule` (มีอยู่แล้ว v15 §50) เป็น intent: ใช้ AoE เมื่อมอนในระยะ ≥ threshold, ultimate เมื่อมอน ≥ threshold, single-target กับ elite, หยุด ultimate เมื่อมอน < threshold, **ห้ามใช้ item สำคัญ (เช่น แกร่ง)** — ค่า default อ่านจาก class spec (`botUsageRule` ต่อสกิล)
  - **Potion** — HP potion threshold (%), ประเภทที่อนุญาต · หมด → เข้า mandatory stop (§5)
  - **Loot filter** — เก็บ/ทิ้งตาม rarity/type · rare/high-value = บังคับ "หยุด+เก็บ+แจ้ง" (แก้ไม่ได้, ดู §5)
- **Rule count:** แต่ละ toggle/condition = 1 rule นับรวม 3 กลุ่ม เทียบเพดาน tier · เกิน → block + Upgrade CTA
- **States:** `default` (จาก preset), `custom`, `at-limit` (ถึงเพดาน → ปุ่มเพิ่มกฎ disable)
- **Tier gating:** counter Free 3 / Plus 10 / Pro 25 · risk opt-in / density-aware / goal-chain / doctrine = Pro (§8.2 map spec) โชว์ locked ให้ tier ต่ำกว่าเห็น
- **Mobile:** accordion เต็มความกว้าง, slider สำหรับ threshold, ปุ่มบวกกฎเป็น bottom bar

---

# 5. P3 — Stop Conditions view

- **Purpose:** โปร่งใส — ให้ผู้เล่นเห็นชัดว่าบอทหยุดเมื่อไร; 9 ข้อบังคับปิดไม่ได้ทุก tier (D-063, §6.5)
- **Layout:** section A "บังคับ (ปิดไม่ได้)" 9 การ์ด read-only + lock icon → section B "เพิ่มเงื่อนไขของฉัน" (custom)
- **9 Mandatory Stops (read-only, ทุก tier):** inventory full · HP potion exhausted · player death threshold · disconnect · map unsafe · rare/high-value item found · boss/event encounter · secret trigger · captcha/anti-abuse challenge
- **Custom (นับเป็น rule ของ tier):** gold cap alert, death count ที่ต่ำลง, runtime cap ของตัวเอง, durability (future)
- **States:** `default` (9 ข้อ), `with-custom`
- **Tier gating:** 9 ข้อบังคับ = เท่ากันทุก tier · custom stop นับรวมเพดาน rule
- **Mobile:** section A เป็น list ยุบได้ (ค่าเริ่มยุบไว้ พร้อมป้าย "9 เงื่อนไขความปลอดภัย")

---

# 6. P4 — Schedule (Plus/Pro)

- **Purpose:** ตั้งเวลาเริ่ม/หยุดอัตโนมัติ — ฟีเจอร์ชูโรงของ paid (D-063)
- **Layout:** list ช่วงเวลา (การ์ดต่อ 1 schedule: profile, วันในสัปดาห์, เวลาเริ่ม–หยุด) + ปุ่มเพิ่ม
- **ข้อมูลที่แก้ได้:** profile ที่ผูก, กรอบวัน/เวลา, ซ้ำรายวัน/สัปดาห์
- **States:** `locked` (Free — ทั้ง panel เป็น preview + Upgrade CTA) · `empty` · `active` · `at-limit` (ถึงเพดาน schedules)
- **Tier gating (D-063):** schedules Free 0 / Plus 2 / Pro 10 · Free เห็น panel นี้แบบ locked (§7 "ฟีเจอร์ paid โชว์ locked ให้ Free เห็น")
- **Mobile:** list + time picker native, เพิ่ม schedule เป็น bottom sheet

---

# 7. P5 — Live Status

- **Purpose:** ความมั่นใจ realtime — เห็นบอทกำลังทำอะไร
- **Layout:** header profile + สถานะ → บล็อกใหญ่ "กำลัง: {action} ที่ {pocket}" → แถวตัวเลขสด (ฆ่าแล้ว, gold, potion เหลือ, inventory เต็มกี่ %) → timeline event ล่าสุด → ปุ่มแดง "หยุดเดี๋ยวนี้" ค้างล่าง
- **ข้อมูลที่แสดง:** action ปัจจุบัน, pocket, mob kill, gold/item ที่ได้, potion/inventory, uptime session, เหตุการณ์ล่าสุด (จาก status stream)
- **States:** `running` · `paused` (schedule/manual) · `stopping` · `stopped` (+เหตุผล) · `error` (§10)
- **Tier gating:** ไม่ gate การดู — ทุก tier เห็น live status ของ profile ที่รันได้ · ตัวเลขเชิงลึก/analytics = Pro (§8, ลิงก์ไป Report)
- **Mobile:** สรุปเป็น card เดียว scroll ได้, ปุ่ม "หยุดเดี๋ยวนี้" fixed เด่นตลอด

---

# 8. P6/P7 — Report (Summary + Detail)

## 8.1 P6 Report Summary
- **Purpose:** สรุปผลว่าบอททำเงิน/ของได้เท่าไร คุ้มเวลาหรือไม่
- **Layout:** ตัวเลือกช่วง (session / วันนี้ / ช่วงตาม retention) → การ์ดสรุป (gold, item, mob kill, death, stop reason เด่น) → กราฟ (เส้น gold/ชม.) → ลิงก์ไป Detail
- **ข้อมูลที่แสดง:** gold/hour · item/hour · mob kill/hour · route used · potion usage · death/stop reason · rare drop trigger (mirror telemetry §8.4 map spec)
- **กราฟ (D-063 addendum):** หน้าต่างกราฟราคา/ผลย้อนหลัง สูงสุด 14 วัน (ค่าอ้างจาก D-063) · window อื่น `PENDING OWNER`

## 8.2 P7 Report Detail
- **Purpose:** ไล่ดูรายวัน/รายการ session
- **Layout:** list วัน (จำกัดตาม retention) → เลือกวัน → รายการ session + event log (kill batch, stop, rare found)
- **States (P6/P7):** `no-data` · `has-data` · `retention-clip` (แสดงเส้นตัด "เก่ากว่านี้ต้องอัปเกรด" — informational, non-pushy)
- **Tier gating (D-063):** reportRetentionDays Free 1 / Plus 14 / Pro 90 · **analytics ขั้นสูง = Pro-only** (breakdown ต่อ pocket/skill, efficiency trend) — โชว์ locked ให้ tier ต่ำ
- **Mobile:** summary card stack, กราฟ scroll แนวนอน, detail เป็น sheet ต่อวัน

---

# 9. P8 — Rare / High-value Alert

- **Purpose:** เจอของแรร์ = บอทหยุด + แจ้งทันที (เป็น 1 ใน 9 mandatory stops)
- **Layout:** toast เด่น (สี `--dp-fire-light`/attention) "เจอของแรร์! บอทหยุดรอคุณ" + ชื่อไอเทม + ปุ่ม "ดู" → เปิด Hub ที่ profile นั้น (สถานะ stopped-rare) · Hub badge ค้างจนกดรับรู้
- **ข้อมูลที่แสดง:** ไอเทม, pocket, เวลา, สถานะบอท = หยุดรอ (ของถูกเก็บเข้ากระเป๋าตาม loot filter, ไม่หาย)
- **Notifications tier (D-063):** push/นอกเกม Free off / Plus on / Pro on · **แต่การหยุด+badge ในเกม = ทุก tier** (เป็น mandatory stop ไม่ใช่ฟีเจอร์ notification)
- **Mobile:** toast บนสุด + badge บน HUD button

---

# 10. P9 — Error / Recovery states

- **Purpose:** เมื่อบอทหยุดผิดปกติ ต้องบอกสาเหตุ + ทางแก้ ไม่ทิ้งผู้เล่นงง
- **สาเหตุ & UI:**
  | สาเหตุ | ข้อความ | ปุ่มกู้คืน |
  |---|---|---|
  | disconnect / server-side หยุด | "การเชื่อมต่อหลุด บอทหยุดปลอดภัยแล้ว" | "เริ่มใหม่" |
  | map unsafe / pocket ปิด | "พื้นที่ไม่ปลอดภัย บอทกลับจุดเซฟ" | "เลือก pocket ใหม่" |
  | captcha/anti-abuse | "ต้องยืนยันตัวตนก่อนทำต่อ" | เปิด challenge |
  | config invalid (หลัง balance patch) | "กฎบางข้อใช้ไม่ได้แล้ว โปรดตรวจ" | "เปิด Rule Builder" |
  | expired-fallback | ดู §12.4 | — |
- **States:** `recoverable` (มีปุ่มกู้) · `needs-action` (ต้องผู้เล่นทำ เช่น captcha) · `data-safe-banner` (ย้ำ "ของที่ได้ถูกบันทึกแล้ว")
- **หลักการ:** ทุก error ต้องยืนยัน "ผลที่ฟาร์มมาไม่หาย" ก่อน (ลด anxiety) — ห้ามใช้ error เป็นข้ออ้างขาย
- **Mobile:** error เป็น banner ในการ์ด profile + toast

---

# 11. P10 — Tier Comparison + Upgrade CTA (non-pushy)

- **Purpose:** ให้ผู้เล่นเข้าใจความต่าง tier "ตอนที่เขาอยากรู้" — ไม่ยัดเยียด
- **หลักการ non-pushy (§7):** CTA **แสดงเฉพาะจุดที่ผู้เล่นชน locked** (เพิ่ม profile เกิน, เปิด Schedule/Analytics, retention clip) · **ห้าม popup ลอยเอง · ห้าม interstitial · ห้ามขัดจังหวะ farm**
- **Layout:** ตารางเทียบ 3 คอลัมน์ (Free/Plus/Pro) ตามตาราง §15 → ปุ่มเลือก pass 1/10/30 วัน ต่อ tier พร้อมราคาไทย → หมายเหตุ "Free ใช้ได้ตลอดไป 24/7"
- **ข้อความหลัก:** "ฟรีก็ฟาร์มได้ 24/7 — จ่ายเพื่อความสะดวก (หลาย profile, กฎเยอะ, ตั้งเวลา, รายงานยาว)" · **ห้าม**เคลม power/เก่งกว่า
- **States:** `from-locked-point` (ไฮไลต์ฟีเจอร์ที่เพิ่งชน) · `browse` (เปิดเองจาก Hub) · `owns-tier` (แสดง tier ปัจจุบัน + วันหมดอายุ)
- **Mobile:** ตารางเลื่อนแนวนอน / stack เป็นการ์ดต่อ tier

---

# 12. Flows

## 12.1 First-unlock micro-tutorial (30–60 วิ, §6.7 · D-035)
ทริกเกอร์: ปลดล็อก/เปิด Bot ครั้งแรก (ดึ๋งๆ เปิดบทในฐานะ presentation layer, ไม่ยัดตอนนาทีแรกของเกม). ต้องสอนครบ 7 จุด: บอททำอะไร · บอทไม่ทำอะไร · stop conditions · inventory full · rare item stop · report · **วิธีหยุดทันที** → จบด้วยปุ่ม "สร้างงานแรก" (→ Setup Wizard). ข้ามได้แต่ปุ่ม "หยุดทันที" ต้องถูกชี้อย่างน้อย 1 ครั้ง.

## 12.2 Start bot
Hub/Setup ยืนยัน → validate (pocket ยัง bot-safe? potion พอ? rule valid?) → `bot:start` → เข้า Live Status `running`.

## 12.3 Stop bot
- **Manual:** ปุ่ม "หยุดเดี๋ยวนี้" (Live Status/Hub) → confirm สั้น → `bot:stop` → `stopped` + สรุป session
- **Mandatory:** เข้า 1 ใน 9 เงื่อนไข → server หยุดเอง → status stream ส่งเหตุผล → UI แสดง stopped/rare/error ตามชนิด (ผู้เล่นปิดไม่ได้)

## 12.4 Pass expiry → Free fallback (D-063)
Pass หมดอายุ → tier ลง Free อัตโนมัติ → profile/rule/schedule **ส่วนเกิน** ถูก "พัก" **read-only ไม่ลบ** → Hub banner `expired-fallback` + ป้ายบน card ที่ถูกพัก "ต่ออายุเพื่อใช้ต่อ" (informational). บอทที่รันอยู่บน profile ที่ถูกพัก → หยุดปลอดภัยแล้วค้าง read-only.

## 12.5 Cross-tier overwrite (D-063)
ซื้อ pass ต่าง tier ระหว่างที่ยังมี pass เดิม → **ทับทันที** พร้อม **warning modal แสดงวันที่เหลือของ pass เดิมที่จะหาย** → ต้องกดยืนยัน. (ราคา/วันไม่คำนวณคืน — แจ้งชัดก่อนยืนยัน)

## 12.6 Same-tier renew (D-063)
ซื้อ pass tier เดิม → **บวกวันต่อท้าย ไม่มี cap** → ป้ายหมดอายุอัปเดต. ไม่มี warning (เป็นบวก).

---

# 13. Server contract (message names — ไม่ใช่ schema เต็ม)

> ชื่อ message = **proposal** (ยังไม่มีใน tech doc) `PENDING OWNER/tech`. Bot agent **รันฝั่ง server**; runtime/anti-abuse/tick constraints = **แยกไป tech doc** ไม่อยู่ใน UI spec นี้.

| ทิศทาง | Message | ใช้ทำ |
|---|---|---|
| C→S | `bot:profileList` | ดึง profile ทั้งหมด (+ สถานะ paid/paused) |
| C→S | `bot:profileCreate` / `bot:profileUpdate` / `bot:profileDelete` | CRUD profile (server enforce เพดาน tier) |
| C→S | `bot:start` / `bot:stop` | เริ่ม/หยุด (start ต้องผ่าน validate pocket bot-safe) |
| S→C | `bot:status` (stream) | สถานะสด: action/pocket/นับฆ่า/gold/potion/inventory/event |
| S→C | `bot:stopped` | หยุดแล้ว + `reason` (1 ใน 9 mandatory / manual / error) |
| S→C | `bot:alert` | rare/high-value found, captcha required, gold cap |
| C→S | `bot:reportList` / `bot:reportFetch` | ดึงสรุป/รายละเอียด (server clip ตาม retention tier) |
| S→C | `bot:tierState` | tier ปัจจุบัน, วันหมดอายุ, รายการ paused (สำหรับ fallback UI) |

หมายเหตุ: server = source of truth ของ **เพดาน tier, retention clip, 9 mandatory stops** — client แค่สะท้อน + กันล่วงหน้า (defense-in-depth) ห้าม client override.

---

# 14. สิ่งที่ห้าม (Forbidden)

- **ขาย power ทุกรูปแบบ (§6.1/§8.3):** stat · drop rate · EXP multiplier · boss auto-clear · secret/rare decision · PvP advantage · success chance · protection from designed pain · guaranteed legendary — **ห้ามโผล่ใน tier comparison หรือ CTA**
- **ปิด/ลด 9 mandatory stops:** ทุก tier ปิดไม่ได้ — UI ต้องไม่มีทางแม้แต่ Pro
- **ให้บอทเข้า boss/secret/event/risk pocket โดยไม่ได้ตั้งค่า** — Setup ไม่แสดง pocket เหล่านี้เป็นตัวเลือกเลย (bot-safe เท่านั้น)
- **Dark patterns:** countdown เร่งเร้าตอนยังเหลือเวลาเยอะ (countdown อนุญาตเฉพาะ < 24 ชม. เชิงแจ้ง) · fake scarcity ("เหลือ N สิทธิ์") · popup upgrade ลอยเอง · interstitial ขัด farm · pre-checked upsell · เคลม "บอทเก่งกว่าเล่นเอง"
- **ปน Auto Pilot / ดึ๋งๆ เข้ากับ Bot** ในปุ่ม/copy/สิทธิ์ (D-035/D-037)
- **แตะ premium currency หลายชั้น/มี expiry** — bot pass ใช้เงินไทยตรง ๆ (D-063), ไม่พัวพัน currency ซ้อน (§8.4)

---

# 15. Tier gating table (canon = D-063)

| Capability | Free | Plus | Pro | บังคับที่ |
|---|---|---|---|---|
| Runtime | 24/7 ไม่จำกัด | 24/7 ไม่จำกัด | 24/7 ไม่จำกัด | server |
| Profiles | 1 | 3 | 10 | Hub/Setup |
| Rules (skill+potion+loot+custom stop) | 3 | 10 | 25 | Rule Builder |
| Report retention | 1 วัน | 14 วัน | 90 วัน | Report |
| Notifications (นอกเกม) | off | on | on | Alert/Schedule |
| Schedules | 0 | 2 | 10 | Schedule |
| Analytics ขั้นสูง | — | — | ✓ | Report |
| 9 Mandatory Stops | ✓ ปิดไม่ได้ | ✓ ปิดไม่ได้ | ✓ ปิดไม่ได้ | Stop Conditions |
| Pass ราคา (1/10/30 วัน) | ฟรีตลอดไป | 9/39/79฿ | 15/69/149฿ | Upgrade |

Fallback/renew/overwrite: §12.4–12.6.

---

# 16. คำถามที่ต้องให้ owner เคาะ (questions to decide)

> ทุกข้อ = **PENDING OWNER**. หัวข้อ economy/monetization → ปิดท้ายด้วยคำถาม ไม่สรุปเอง (v15 §53).

1. **Status stream interval (Live Status):** อัปเดตสด — เสนอ poll/push ทุก ~2–3 วิ (Design Knob `botStatusPushIntervalSec`). *แนะนำ:* 2 วิ ตอนเปิด panel, 10 วิ เมื่อ background — ยืนยัน?
2. **Report graph window:** D-063 ให้กราฟราคา 14 วัน — ใช้ 14 วันเป็น default window ของ Report graph ทุก tier (clip ตาม retention) ไหม หรือให้ window = retention ของ tier (Free 1 / Plus 14 / Pro 90)? *แนะนำ:* window = retention tier เพื่อให้ Pro เห็นคุณค่า 90 วัน.
3. **Custom stop นับรวมเพดาน rule หรือแยกโควตา?** ตอนนี้ spec ให้นับรวม (custom stop กิน rule slot). *แนะนำ:* นับรวม เพื่อความง่าย + กันเลี่ยงเพดาน — โอเคไหม?
4. **Rule counting granularity:** 1 toggle/condition = 1 rule (เช่น "AoE เมื่อ ≥6" = 1). ยืนยันนิยาม "rule" นี้ให้ตรงกับที่ D-063 หมายถึง 3/10/25?
5. **Micro-tutorial ทริกเกอร์ซ้ำ:** ให้เปิดได้อีกจากปุ่ม "?" ใน Hub (นอกจากครั้งแรก) ไหม? *แนะนำ:* ให้เปิดซ้ำได้ (help), แต่ auto-trigger เฉพาะครั้งแรก.
6. **Rare/high-value นิยาม threshold** ที่ทำให้บอทหยุด — อิง rarity tier ใด (เช่น ≥ Rare) หรือมูลค่า gold? = Design Knob `botRareStopThreshold` `PENDING OWNER`.
7. **Base preset ที่จะมีตอน launch:** เสนอ 2 ตัว ("ฟาร์มเซฟ AoE", "ฟาร์มเดี่ยวประหยัด potion"). owner อยากได้กี่ตัว/ชื่ออะไร?
8. **Supporter tier** (cosmetic รายเดือน) พักไว้หลัง beta (D-063) — Bot UI นี้ **ไม่ผูก** Supporter ใด ๆ; ยืนยันว่า Supporter ไม่แตะ bot power/ความสามารถ (คงเป็น cosmetic ล้วน)?
