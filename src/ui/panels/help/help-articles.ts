// Help Article Registry (P2-12, DG §6/§14.1) — data-driven, pure (no React). เนื้อหาจริงครอบ: เดิน/ตี/
// กระเป๋า/สวมใส่/ร้านค้า/เสริมแกร่ง (ต้องมี copy บังคับ R8 "ของหายากมากับบอส")/ตาย-ฟื้น/AFK-สลับแท็บ (D-056).
// Component จริง (HelpPanel.tsx) เรียกฟังก์ชันที่นี่เท่านั้น — ไม่มี logic/copy ซ้ำใน component
// (pattern เดียวกับ enhancement-view.ts/shop-view.ts, ดู docs/agent-rules.md).

import { ENHANCEMENT_PANEL_ID } from "@/ui/panels/enhancement/enhancement-view";
import { INVENTORY_PANEL_ID } from "@/ui/panels/inventory/inventory-view";
import { SHOP_PANEL_ID } from "@/ui/panels/shop/shop-view";
import {
  HELP_ONE_LINE_MAX_CHARS,
  HELP_STEPS_MAX,
  type HelpArticle,
  type HelpCategory,
} from "./help-types";

/**
 * Registry จริง (P2-12) — ครอบทุกหมวดที่ brief ระบุ: เดิน, ตี, เก็บของ/กระเป๋า, สวมใส่, ขายของ/ร้านค้า,
 * เสริมแกร่ง (hint R8 บังคับ), ตาย/ฟื้น, AFK/สลับแท็บ (D-056). Order = ลำดับที่แสดงในลิสต์ "เล่นระบบนี้ยังไง".
 */
export const HELP_ARTICLES: readonly HelpArticle[] = [
  {
    id: "movement",
    category: "movement",
    title: "เดินยังไง",
    oneLine: "คลิก/แตะจุดที่จะไปบนแผนที่ ตัวละครเดินไปเอง — มือถือใช้ virtual joystick ได้เหมือนกัน",
    steps: [
      "PC: คลิกซ้ายบนพื้นที่ต้องการเดินไป",
      "มือถือ: ลาก joystick มุมล่างซ้าย หรือแตะจุดหมายบนจอ",
      "ตัวละครเดินอ้อมสิ่งกีดขวางให้เอง",
    ],
    moreDetail:
      "การเดินคำนวณเส้นทางบน grid ไอโซเมตริกฝั่งเซิร์ฟเวอร์ — ถ้าเดินไม่ไปตามที่คลิก มักเป็นเพราะจุดนั้นเป็นสิ่งกีดขวาง/นอกแผนที่",
    action: { type: "none" },
    applicableScreens: [],
  },
  {
    id: "combat",
    category: "combat",
    title: "ตียังไง",
    oneLine: "คลิก/แตะมอนเพื่อโจมตีพื้นฐาน ใช้ปุ่มสกิลแถบล่างจอสำหรับสกิล",
    steps: [
      "คลิก/แตะมอนที่ต้องการโจมตี",
      "ตัวละครเข้าระยะแล้วโจมตีอัตโนมัติ",
      "กดปุ่มสกิล (แถบล่าง) เพื่อใช้ท่าพิเศษ",
      "ฆ่ามอนสำเร็จ = ได้ EXP/gold/ของ ทันที",
    ],
    moreDetail: "ดาเมจคำนวณฝั่งเซิร์ฟเวอร์เสมอ (ป้องกันโกง) — ตัวเลขดาเมจที่เห็นบนจอคือผลจริงที่ HP ลด",
    action: { type: "none" },
    applicableScreens: [],
  },
  {
    id: "inventory_bag",
    category: "inventory",
    title: "เก็บของ/ใช้กระเป๋ายังไง",
    oneLine: "ของที่เก็บได้เข้ากระเป๋าอัตโนมัติ — กดปุ่ม \"กระเป๋า\" (คีย์ I บน PC) เพื่อดู/จัดการของ",
    steps: [
      'เปิดกระเป๋าจากปุ่ม HUD "กระเป๋า" หรือกด I',
      "ของใหม่เข้าช่องว่างอัตโนมัติหลังฆ่ามอน/เก็บของ",
      "กระเป๋าเต็ม = ของที่ได้เพิ่มจะแจ้งเตือน ไม่หายเงียบ ๆ",
    ],
    moreDetail: "ความจุกระเป๋าเริ่มต้นมีจำนวนช่องคงที่ — คลังส่วนตัว (Storage) เก็บของเพิ่มได้ในเฟสถัดไป",
    action: { type: "open_panel", panelId: INVENTORY_PANEL_ID, label: "เปิดกระเป๋า" },
    applicableScreens: [INVENTORY_PANEL_ID],
  },
  {
    id: "equip_item",
    category: "equipment",
    title: "สวมใส่อุปกรณ์ยังไง",
    oneLine: "เปิดกระเป๋า เลือกอุปกรณ์ กด \"สวมใส่\" — ถอดออกก็กดปุ่มเดิมซ้ำตอนดูของที่สวมอยู่",
    steps: ['เปิดกระเป๋า', "เลือกอุปกรณ์ในช่อง", 'กด "สวมใส่"'],
    moreDetail: "สวมได้ 1 ชิ้นต่อ 1 ตำแหน่งเสมอ — สวมชิ้นใหม่ทับจะถอดชิ้นเดิมกลับเข้ากระเป๋าให้อัตโนมัติ",
    action: { type: "open_panel", panelId: INVENTORY_PANEL_ID, label: "เปิดกระเป๋า" },
    applicableScreens: [INVENTORY_PANEL_ID],
  },
  {
    id: "shop_buy_sell",
    category: "shop",
    title: "ซื้อของ/ขายของที่ร้านค้ายังไง",
    oneLine: 'เปิด "ร้านค้า" จาก HUD แท็บซื้อ/ขาย เลือกของ ใส่จำนวน แล้วกดยืนยัน',
    steps: [
      'กดปุ่ม HUD "ร้านค้า" (โชว์เฉพาะจุดที่มีร้าน)',
      'แท็บ "ซื้อ": เลือกของในลิสต์ร้าน ใส่จำนวน กด "ยืนยันซื้อ"',
      'แท็บ "ขาย": เลือกของในกระเป๋า ใส่จำนวน กด "ยืนยันขาย"',
      "ยอดเงินอัปเดตทันทีหลังทำรายการสำเร็จ",
    ],
    moreDetail: "ราคาซื้อกำหนดโดยเซิร์ฟเวอร์เสมอ — ราคาขายจะรู้ก็ต่อเมื่อขายสำเร็จแล้วเท่านั้น",
    action: { type: "open_panel", panelId: SHOP_PANEL_ID, label: "เปิดร้านค้า" },
    applicableScreens: [SHOP_PANEL_ID],
  },
  {
    id: "enhancement",
    category: "enhancement",
    title: "เสริมแกร่งยังไง",
    oneLine: "เลือกอุปกรณ์ในกระเป๋า กด \"เสริมแกร่ง\" ใช้วัสดุ 1 ชิ้น เพิ่มระดับได้ 100% ไม่มีทางพลาด",
    steps: [
      'เปิดกระเป๋า เลือกอุปกรณ์ แล้วกด "เสริมแกร่ง"',
      "ต้องมีวัสดุเสริมแกร่งอย่างน้อย 1 ชิ้น",
      'กด "ยืนยันเสริมแกร่ง" — ระดับ +1 ทันที รับประกันสำเร็จเสมอ',
    ],
    // R8 (D-052, verbatim) — ห้ามเปลี่ยนคำ: "ของหายากมากับบอส" (มีบังคับในบทความนี้ตาม brief)
    moreDetail:
      "การเสริมแกร่งไม่มีโอกาสพลาด/แตก/เสียของเลย — วัสดุเสริมแกร่งของหายากมากับบอส หาไม่เจอตอนนี้ก็ไม่ใช่เรื่องแปลก",
    action: { type: "open_panel", panelId: ENHANCEMENT_PANEL_ID, label: "เปิดเสริมแกร่ง" },
    applicableScreens: [ENHANCEMENT_PANEL_ID],
  },
  {
    id: "death_respawn",
    category: "death_respawn",
    title: "ตายแล้วทำยังไงต่อ",
    oneLine: "ตัวละครตายไม่เสียของ/ไม่เสียเลเวล — ฟื้นแล้วกลับมาเล่นต่อได้ทันทีที่จุดฟื้น",
    steps: ["รอหน้าจอฟื้นตัวขึ้น", "ตัวละครฟื้นที่จุดฟื้นใกล้สุด", "เดินกลับไปเล่นต่อได้เลย"],
    moreDetail: "ความตายในดึ๋งปุ๊เป็นแค่จังหวะสะดุด ไม่ใช่บทลงโทษ — ไม่มีระบบหักของ/หักเลเวลตอนตาย",
    action: { type: "none" },
    applicableScreens: [],
  },
  {
    id: "afk_tab_switch",
    category: "afk_tab",
    title: "พับจอ/สลับแท็บแล้วตัวละครเป็นยังไง",
    oneLine: "สลับแท็บ/พับจอได้ ตัวละครค้างอยู่ในโลกต่อ ไม่ถูกเตะออก — แต่ยังรับดาเมจได้ถ้าอยู่ในการต่อสู้",
    steps: [
      "สลับแท็บ/ย่อหน้าต่างได้ตามปกติ ตัวละครไม่หลุดออกจากเกม",
      "ไม่ขยับตามคำสั่งเดิมอัตโนมัติ (หยุดรับ input ใหม่)",
      "ยืนนิ่งเกิน 60 วิ = มีป้าย AFK ให้ผู้เล่นอื่นเห็น",
      "กลับมาที่แท็บ = ข้อมูลซิงก์ใหม่ทันที",
    ],
    moreDetail:
      "ปิดแท็บจริง ๆ หรือ OS สั่งปิดเอง (พบมากบนมือถือ) มีเวลาผ่อนผันสั้น ๆ ให้กลับมาต่อก่อนถูกนำออกจากโลก",
    action: { type: "none" },
    applicableScreens: [],
  },
];

/** หา article จาก id — undefined ถ้าไม่มี (defensive, id พิมพ์ผิด/ลบออกไปแล้ว) */
export function getHelpArticle(id: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((article) => article.id === id);
}

/** article ทั้งหมดของ 1 หมวด — เรียงตามลำดับใน registry */
export function getHelpArticlesByCategory(category: HelpCategory): HelpArticle[] {
  return HELP_ARTICLES.filter((article) => article.category === category);
}

/** context help "?" ของจอระบบ (DG §5.4) — คืน article แรกที่ผูกกับ panel นั้น, null ถ้าไม่มี */
export function getContextHelpArticle(panelId: string): HelpArticle | null {
  return HELP_ARTICLES.find((article) => article.applicableScreens.includes(panelId)) ?? null;
}

/** ผลตรวจ 1 บทความ — ไม่ throw, คืนรายการปัญหาทั้งหมด (เทสต์อ่านง่ายกว่า throw ตัวแรกแล้วหยุด) */
export interface HelpArticleValidationResult {
  articleId: string;
  errors: string[];
}

/** guard shape ตาม DG §6.2: one-line ≤120 ตัวอักษร, steps ≤4 ข้อ, ต้องมีอย่างน้อย 1 step + oneLine ไม่ว่าง */
export function validateHelpArticle(article: HelpArticle): HelpArticleValidationResult {
  const errors: string[] = [];
  if (article.oneLine.length === 0) errors.push("oneLine ว่างเปล่า");
  if (article.oneLine.length > HELP_ONE_LINE_MAX_CHARS) {
    errors.push(`oneLine ยาวเกิน ${HELP_ONE_LINE_MAX_CHARS} ตัวอักษร (${article.oneLine.length})`);
  }
  if (article.steps.length === 0) errors.push("steps ว่างเปล่า");
  if (article.steps.length > HELP_STEPS_MAX) {
    errors.push(`steps เกิน ${HELP_STEPS_MAX} ข้อ (${article.steps.length})`);
  }
  if (article.moreDetail.length === 0) errors.push("moreDetail ว่างเปล่า");
  return { articleId: article.id, errors };
}

/** ตรวจทั้ง registry — ใช้ทั้งใน production sanity check (import time ปลอดภัย ไม่ throw) และเทสต์ guard */
export function validateAllHelpArticles(): HelpArticleValidationResult[] {
  return HELP_ARTICLES.map(validateHelpArticle).filter((result) => result.errors.length > 0);
}
