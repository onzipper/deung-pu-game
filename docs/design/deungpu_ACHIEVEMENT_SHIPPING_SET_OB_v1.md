# Achievement Shipping Set — Open Beta (Map 1, นักดาบ) v1

_สร้าง 2026-07-14 โดย game-designer AI ภายใต้อำนาจที่ owner มอบ (2026-07-14: "ชุด achievement = จัดการเอง") —
กรอบทั้งหมดอิง `deungpu_ACHIEVEMENT_AND_ADVENTURE_JOURNAL_SPEC_v1.md` §3/§4.1/§6/§10/§14.
สถานะ: **LOCKED สำหรับ implement C2** · gold values = Design Knob (v15 §48) ปรับได้ · id ล็อกเมื่อมี save data._

**นับรวม:** 65 (core 60 + expanded 5) · gold reward 20 ตัว (~31%, band 30–200) · title/none 45 (~69%)
**คำเคาะ orchestrator (ตามอำนาจมอบ):** gold band 30–200 อนุมัติ (รวม ~1,540g ทั้งเกม ≈ 8–10 boss kills — จิ๋ว) ·
wallet scope = **character** · `ach_rain_walk_30` ship (บังคับ TIME_ACCUMULATION ที่ engine ต้องมีอยู่แล้ว)

id ยืนยันกับโค้ดจริงแล้ว: `mon_map1_{slime,bird,boar}`, `elite_map1_boar_rampage`, `boss_map1_boiling_boar`,
`mat_slime_gel`, `npc_lungdeung`/`npc_papu`, map `map1`/`city-hub` (Story Boss `boss_map1_resonant_guardian` = P2B ไม่แตะ)

## ตารางชุด ship (Progression 7 · Combat 10 · Elite&Boss 6 · Enhancement 7 · Economy 10 · Loot 4 · Living world 7 · NPC/meme 5 · Death 4 · Expanded 5)

### Progression (7)
| id | ชื่อไทย | tier | vis | scope | rule | reward |
|---|---|---|---|---|---|---|
| ach_first_step | ก้าวแรก | COMMON | visible | character | Counter character.created ≥1 | none |
| ach_leave_town | โลกข้างนอก | COMMON | visible | character | Counter map.enter{map1,firstVisit} ≥1 | none |
| ach_first_kill | มือใหม่หัดล่า | COMMON | visible | character | Counter mob.killed ≥1 | none |
| ach_level_5 | เริ่มจับทาง | COMMON | visible | character | MaxValue level ≥5 | gold:30 |
| ach_level_10 | เริ่มเข้าที่ | UNCOMMON | visible | character | MaxValue level ≥10 | gold:80 |
| ach_level_15 | สุดทางแดนหม้อเดือด | HARD | visible | character | MaxValue level ≥15 | gold:150 |
| ach_all_systems | รู้จักไปหมดแล้วนี่ | UNCOMMON | visible | account | DistinctSet system∈[enhance.success,shop.buy,storage.deposit,delivery.send,npc.talk] =5 | title:title_jack_of_trades |

### Combat (10)
| id | ชื่อไทย | tier | vis | scope | rule | reward |
|---|---|---|---|---|---|---|
| ach_slime_100 | นักปราบเมือกดึ๋ง | COMMON | visible | character | Counter kill{mon_map1_slime} ≥100 | gold:40 |
| ach_slime_1000 | ราชาเมือกดึ๋ง | HARD | visible | character | Counter kill{mon_map1_slime} ≥1000 | title:title_slime_king |
| ach_bird_100 | ไล่จับนกจิกปุ๊ | COMMON | visible | character | Counter kill{mon_map1_bird} ≥100 | gold:40 |
| ach_boar_100 | พรานหมูป่า | UNCOMMON | visible | character | Counter kill{mon_map1_boar} ≥100 | gold:60 |
| ach_kill_500 | นักล่าขาประจำ | UNCOMMON | visible | character | Counter kill{any} ≥500 | gold:80 |
| ach_kill_5000 | สังหารไม่เลือกหน้า | HARD | visible | character | Counter kill{any} ≥5000 | title:title_relentless |
| ach_map1_bestiary | รู้จักสัตว์ร้ายแดนนี้ | UNCOMMON | visible | character | DistinctSet kill monsterId ∈5 ชนิด Map1 =5 | title:title_bestiary_map1 |
| ach_one_shot | ทีเดียวจอด | UNCOMMON | visible | character | Counter kill{hpFracBefore=1.0} ≥1 | none |
| ach_overkill | แรงไปไหมเนี่ย | MEME | visible | character | Counter kill{overkillPct>300} ≥1 | none |
| ach_low_hp_win | เหลือเลือดเส้นเดียว | HARD | hidden(cond) | character | Counter kill{rank=boss, playerHpFrac<0.05} ≥1 | title:title_clutch |

### Elite & Boss (6)
| id | ชื่อไทย | tier | vis | scope | rule | reward |
|---|---|---|---|---|---|---|
| ach_elite_first | เจอตัวคลั่ง | COMMON | visible | character | Counter kill{elite_map1_boar_rampage} ≥1 | gold:50 |
| ach_elite_10 | ปราบความคลั่ง | UNCOMMON | visible | character | Counter kill{elite_map1_boar_rampage} ≥10 | gold:100 |
| ach_boss_first | เปิดหม้อครั้งแรก | COMMON | visible | character | Counter kill{boss_map1_boiling_boar} ≥1 | gold:100 |
| ach_boss_10 | นักล่าหม้อเดือด | UNCOMMON | visible | character | Counter kill{boss_map1_boiling_boar} ≥10 | gold:200 |
| ach_boss_last_hit | ปิดหม้อ | UNCOMMON | visible | character | Counter kill{rank=boss,lastHitByPlayer} ≥1 | title:title_finisher |
| ach_boss_solo | คนเดียวก็ต้มได้ | EXTREME | hidden(cond) | character | Composite all[kill{boss}, partySize=1, damageShare=100%] | title:title_lone_chef |

### Enhancement (7)
| id | ชื่อไทย | tier | vis | scope | rule | reward |
|---|---|---|---|---|---|---|
| ach_enh_first | บวกติดครั้งแรก | COMMON | visible | character | Counter enhance.success ≥1 | none |
| ach_enh_plus5 | เริ่มเป็นเงา | UNCOMMON | visible | character | MaxValue plus ≥5 | gold:50 |
| ach_enh_plus10 | ของจริงเสียที | HARD | visible | character | MaxValue plus ≥10 | gold:150 |
| ach_enh_plus15 | ใจถึงพึ่งได้ | EXTREME | visible | character | MaxValue plus ≥15 | title:title_plus15 |
| ach_enh_streak5 | มือขึ้น | HARD | visible | character | Streak succ=enhance.success reset=fail =5 | gold:120 |
| ach_enh_fail10 | วันนี้ดวงไม่เข้าข้าง | MEME | visible | character | Streak succ=enhance.fail reset=success =10 | none |
| ach_enh_100 | ช่างตีบวกมือฉมัง | HARD | visible | character | Counter enhance.success ≥100 | gold:100 |

### Economy (10)
| id | ชื่อไทย | tier | vis | scope | rule | reward |
|---|---|---|---|---|---|---|
| ach_first_sale | เปิดร้านแล้ว | COMMON | visible | character | Counter shop.sell ≥1 | none |
| ach_first_buy | ลูกค้าคนแรก | COMMON | visible | character | Counter shop.buy ≥1 | none |
| ach_sell_100 | พ่อค้าขาประจำ | UNCOMMON | visible | character | Counter shop.sell ≥100 | gold:60 |
| ach_gold_1k | เริ่มมีตังค์ | COMMON | visible | character | MaxValue gold.balance ≥1000 | none |
| ach_gold_10k | เริ่มมีเงินเก็บ | UNCOMMON | visible | character | MaxValue gold.balance ≥10000 | gold:100 |
| ach_gold_earn_50k | ขยันหาไม่หยุดมือ | HARD | visible | character | Counter gold.earned ≥50000 | gold:200 |
| ach_storage_first | เก็บเข้าคลัง | COMMON | visible | account | Counter storage.deposit ≥1 | none |
| ach_storage_100 | นักสะสมตัวยง | UNCOMMON | visible | account | Counter storage.deposit ≥100 | gold:40 |
| ach_delivery_first | ฝากส่งของหน่อย | COMMON | visible | account | Counter delivery.send ≥1 | none |
| ach_sell_buyback | คิดถึงของเก่า | MEME | hidden(cond) | character | Sequence [sell{X}, buy{X}] ≤30s | none |

### Loot (4)
| id | ชื่อไทย | tier | vis | scope | rule | reward |
|---|---|---|---|---|---|---|
| ach_loot_first | ของชิ้นแรก | COMMON | visible | character | Counter item.dropped ≥1 | none |
| ach_loot_100 | เก็บไม่เลือกของ | UNCOMMON | visible | character | Counter item.dropped ≥100 | gold:40 |
| ach_loot_rare | ของดีมีชัย | HARD | hidden(cond) | character | Counter item.dropped{rarity=rare} ≥1 | title:title_lucky_find |
| ach_slime_gel_50 | นักสะสมเมือก | UNCOMMON | visible | character | Counter item.dropped{mat_slime_gel} ≥50 | gold:30 |

### Living world (7)
| id | ชื่อไทย | tier | vis | scope | rule | reward |
|---|---|---|---|---|---|---|
| ach_first_rain | ฝนแรกของแดน | COMMON | visible | account | Counter weather.changed{rain} ≥1 | none |
| ach_rain_10 | คนไม่กลัวเปียก | UNCOMMON | visible | account | Counter weather.changed{rain} ≥10 | none |
| ach_night_10 | ชาวราตรี | UNCOMMON | visible | account | Counter phase.changed{night} ≥10 | none |
| ach_dawn_watcher | คนตื่นก่อนฟ้าสาง | MYSTERY | hidden(cond) | account | Counter phase.changed{dawn,onMap=map1} ≥1 | title:title_early_bird |
| ach_all_phases | ครบวันครบคืน | UNCOMMON | visible | account | DistinctSet phase ∈[dawn,day,dusk,night] =4 | title:title_all_hours |
| ach_rain_walk_30 | เดินเล่นกลางสายฝน | UNCOMMON | hidden(cond) | account | TimeAccum rain∧map1 ≥30min | none |
| ach_npc_first | ทักทายชาวบ้าน | COMMON | visible | account | Counter npc.talk ≥1 | none |

### NPC & meme (5)
| id | ชื่อไทย | tier | vis | scope | rule | reward |
|---|---|---|---|---|---|---|
| ach_npc_both | คุยครบทั้งลุงทั้งป้า | COMMON | visible | account | DistinctSet npc ∈[npc_lungdeung,npc_papu] =2 | none |
| ach_npc_lungdeung_50 | ขาประจำลุงดึ๋ง | MEME | visible | character | Counter npc.talk{npc_lungdeung} ≥50 | none |
| ach_npc_100_same | เขาไม่มีอะไรจะเล่าแล้ว | MEME | hidden(cond) | character | Counter npc.talk{same npcId} ≥100 | none |
| ach_return_town_1min | ลืมอะไรไว้เหรอ | MEME | hidden(cond) | character | Sequence [enter map1, enter city-hub] ≤60s | none |
| ach_logo_click_100 | ดึ๋งปุ๊! | MEME | hidden(full) | account | Counter ui.logo.click ≥100 | title:title_dungpu |

### Death (4)
| id | ชื่อไทย | tier | vis | scope | rule | reward |
|---|---|---|---|---|---|---|
| ach_first_death | ล้มครั้งแรก | COMMON | visible | character | Counter death ≥1 | none |
| ach_die_before_kill | มือใหม่ของแท้ | MEME | hidden(full) | character | Composite all[death, notOccurred kill lifetime] | none |
| ach_death_same_spot_10 | จุดตายประจำ | MEME | hidden(cond) | character | Counter death{same mapId+gridCell} ≥10 | none |
| ach_death_100 | ล้มแล้วลุกเสมอ | UNCOMMON | visible | character | Counter death ≥100 | none |

### Expanded (5 — hidden จนกว่า content ship, ไม่นับใน 60 core)
| id | ชื่อไทย | trigger | phase |
|---|---|---|---|
| ach_map_2 | ทางยังอีกยาว | map.enter{map2} | Maps 2-4 |
| ach_dungdung_rescue | เพื่อนตัวเล็ก | companion.rescued | companion |
| ach_dungdung_speaks | มันพูดได้เหรอ?! | companion.spoke (hidden full) | companion |
| ach_archer_first_kill | ธนูก็เอาอยู่ | kill{class=archer} | archer |
| ach_bot_first | มีลูกน้องแล้ว | bot.deployed | bot |

## Event taxonomy (18 ชนิด = C2 emission checklist)

1 character.created · 2 map.enter{mapId,fromMapId,firstVisit} · 3 **mob.killed**{monsterId,rank,hpFracBefore,overkillPct,playerHpFrac,lastHitByPlayer,partySize,damageSharePct} · 4 level.up{newLevel} · 5 enhance.success{plus} · 6 enhance.fail{plus} · 7 shop.buy{itemId,qty,goldSpent} · 8 shop.sell{itemId,qty,goldGained,rarity} · 9 storage.deposit · 10 delivery.send · 11 death{mapId,gridCell,cause} · 12 gold.earned{amount} · 13 gold.balance{balance} · 14 item.dropped{itemId,rarity} · 15 npc.talk{npcId} · 16 weather.changed{weather} · 17 phase.changed{phase} · 18 ui.logo.click

**⚠ implementer notes:** field derived ของ mob.killed (playerHpFrac/lastHit/overkill/partySize/damageShare) ต่อจาก combat-result calc = **never-downgrade zone → top tier** · ach_rain_walk_30 ต้องมี rain-time accumulator เล็กๆ จาก world clock · expanded events (companion.*, bot.deployed) ยังไม่ต้องสร้าง

## Reward discipline (ตาม §10)

MEME/hidden ทุกตัว = title/none เท่านั้น · ไม่มี item/stat/material/premium ทุกกรณี · gold รวมทั้งชุด ~1,540g ·
auto-claim + idempotent · retroactivePolicy: safe สำหรับ Counter ล้วน, none สำหรับ Streak/Sequence/Composite
