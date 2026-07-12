// P2-06a — ข้อความ error ภาษาไทยของ Game Hub (ไม่ผูก server — client-safe).
// mapping ตาม reason code ที่ src/server/auth/service.ts + src/server/characters/service.ts คืนมา
// + UI spec §6.5 (login/guest errors) + Storage §3.3 (character name errors).

export function authErrorMessage(reason: string): string {
  switch (reason) {
    case "invalid_email":
      return "อีเมลไม่ถูกต้อง";
    case "email_mismatch":
      return "อีเมลทั้งสองช่องไม่ตรงกัน";
    case "weak_password":
      return "รหัสผ่านสั้นเกินไปหรือถูกใช้ทั่วไป (อย่างน้อย 10 ตัวอักษร)";
    case "email_taken":
      return "อีเมลนี้ถูกใช้แล้ว";
    case "invalid_credentials":
      return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
    case "account_not_found":
      return "ไม่พบบัญชีนี้";
    case "already_has_email":
      return "บัญชีนี้ผูกอีเมลอื่นไปแล้ว";
    case "bad_request":
      return "ข้อมูลที่ส่งไม่ถูกต้อง";
    default:
      return "เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่";
  }
}

export function characterNameErrorMessage(reason: string | undefined): string {
  switch (reason) {
    case "empty":
      return "กรอกชื่อตัวละคร";
    case "too_short":
      return "สั้นเกินไป (ขั้นต่ำ 3 ตัวอักษร)";
    case "too_long":
      return "ยาวเกินไป (สูงสุด 16 ตัวอักษร)";
    case "invalid_char":
      return "ใช้ได้เฉพาะตัวอักษรไทย/อังกฤษ/ตัวเลข";
    case "invalid_space":
      return "เว้นวรรคภายในได้ 1 ช่องเท่านั้น (ห้ามนำ/ท้าย/ติดกัน)";
    default:
      return "ชื่อไม่ถูกต้อง";
  }
}

// ชื่อไทยของแต่ละ classId — ลำดับ 5 อาชีพตาม decision-index 2026-07-12 (Bible 1.4/2.1).
// มีแค่ "swordsman" ที่เปิดเล่นได้จริงใน P2 (src/shared/character-class.ts CLASS_IDS).
const CLASS_LABELS: Record<string, string> = {
  swordsman: "นักดาบ",
};

export function classLabel(classId: string): string {
  return CLASS_LABELS[classId] ?? classId;
}

export function createCharacterErrorMessage(reason: string, nameError?: string): string {
  switch (reason) {
    case "invalid_name":
      return characterNameErrorMessage(nameError);
    case "invalid_class":
      return "อาชีพนี้ยังเปิดไม่ได้";
    case "slots_full":
      return "ใช้ครบ 5/5 ช่องแล้ว";
    case "name_taken":
      return "ชื่อนี้ถูกใช้แล้ว";
    case "unauthorized":
      return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง";
    default:
      return "เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่";
  }
}
