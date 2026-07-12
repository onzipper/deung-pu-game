// P2-06a — character name validator (pure, shared client+server).
// Source: Account/Character/Storage Flow Spec v1 §3.3 (Naming) — supersedes UI spec §7.1 baseline.
//
// กติกา (decision-index 2026-07-12, S4 batch): 3–16 ตัวอักษร, ไทย/อังกฤษ/เลข, เว้นวรรคภายในได้ 1 ช่องติดกัน
// (ห้ามนำ/ต่อท้าย, ห้ามติดกัน 2+), unique global case-insensitive (บังคับที่ DB collation + repo), NFC normalize,
// ห้าม emoji/control char — คุมด้วย charset whitelist (ตัวอักษรนอกไทย/ละติน/เลข/เว้นวรรค = invalid_char เสมอ
// รวม emoji ทุกช่วง unicode และ control char).
//
// ⚠️ ความยาว: นับด้วย Array.from (code point, จับ surrogate pair เป็น 1 หน่วย) ไม่ใช่ grapheme cluster จริง —
// สระ/วรรณยุกต์ไทยที่เป็น combining mark (เช่น ่ ้ ็ ั) จะถูกนับแยกจากพยัญชนะฐาน ทำให้ "ความยาวที่มองเห็น"
// กับความยาวที่นับได้ต่างกันได้เล็กน้อย — ยอมรับ ณ P2 (ตามคอมเมนต์ brief); ถ้าต้องการ grapheme cluster จริง
// ต้องใช้ Intl.Segmenter (เพิ่มทีหลังถ้า owner ต้องการความแม่นยำกว่านี้).

export const CHARACTER_NAME_MIN = 3;
export const CHARACTER_NAME_MAX = 16;

export type CharacterNameErrorCode =
  | "empty"
  | "too_short"
  | "too_long"
  | "invalid_char"
  | "invalid_space";

export type CharacterNameValidation =
  | { ok: true; value: string } // NFC-normalized name
  | { ok: false; reason: CharacterNameErrorCode };

// whitelist: ละติน a-z A-Z, เลข 0-9, ไทย (base block U+0E00–U+0E7F ครอบทั้งพยัญชนะ/สระ/วรรณยุกต์/เลขไทย),
// เว้นวรรค ' ' (charset เดียว — invalid_space cover กติกาการวางตำแหน่ง). ไม่มี 'u' flag ต้องใส่เพราะทุกช่วงอยู่ใน BMP;
// อักขระนอกช่วงนี้ (emoji ส่วนใหญ่อยู่ supplementary plane, control char, สัญลักษณ์อื่น) ไม่ match เสมอ → invalid_char.
const ALLOWED_CHAR_RE = /^[A-Za-z0-9฀-๿ ]+$/;

/** ตรวจชื่อตัวละคร — pure, ไม่แตะ DB (uniqueness ตรวจแยกที่ repository/DB unique constraint). */
export function validateCharacterName(raw: unknown): CharacterNameValidation {
  if (typeof raw !== "string") return { ok: false, reason: "empty" };

  const name = raw.normalize("NFC");
  if (name.length === 0) return { ok: false, reason: "empty" };

  // ตำแหน่งเว้นวรรค: ห้ามนำ/ท้าย, ห้ามติดกัน 2 ช่องขึ้นไป (เว้นวรรคภายใน 1 ช่องเท่านั้น — §3.3 internalSingleSpace)
  if (/^\s|\s$/.test(name) || /\s{2,}/.test(name)) {
    return { ok: false, reason: "invalid_space" };
  }

  if (!ALLOWED_CHAR_RE.test(name)) return { ok: false, reason: "invalid_char" };

  const length = Array.from(name).length;
  if (length < CHARACTER_NAME_MIN) return { ok: false, reason: "too_short" };
  if (length > CHARACTER_NAME_MAX) return { ok: false, reason: "too_long" };

  return { ok: true, value: name };
}
