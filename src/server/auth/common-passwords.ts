// P2-03 — reject-common-passwords list (spec §1.4 rejectCommonPasswords: true).
//
// ชุดย่อของรหัสผ่านที่รั่ว/เดาง่ายบ่อยที่สุด (เทียบแบบ lowercase). ไม่ใช่ list เต็ม —
// spec ต้องการ "reject common" ไม่ใช่ HIBP-complete; ก่อน closed alpha ควรต่อ
// breach-list/HIBP k-anonymity (P2B). ค่าที่ผ่าน min-length 10 บางตัวยังเดาง่าย
// จึงรวม passphrase/keyboard-walk ยอดฮิตด้วย.
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  "password",
  "password1",
  "password123",
  "password1234",
  "passw0rd",
  "p@ssword",
  "p@ssw0rd",
  "1234567890",
  "12345678901",
  "123456789012",
  "0123456789",
  "qwertyuiop",
  "qwerty123456",
  "1q2w3e4r5t",
  "1qaz2wsx3edc",
  "asdfghjkl",
  "zxcvbnmasdf",
  "iloveyou123",
  "letmein1234",
  "welcome123",
  "welcome1234",
  "admin123456",
  "administrator",
  "changeme123",
  "trustno1234",
  "abc123456789",
  "football123",
  "baseball123",
  "monkey123456",
  "dragon123456",
  "superman123",
  "batman123456",
  "sunshine123",
  "princess123",
  "whatever123",
  "computer123",
  "internet123",
  "samsung123",
  "michael1234",
  "jennifer123",
  "thailand123",
  "bangkok1234",
  "0000000000",
  "1111111111",
  "aaaaaaaaaa",
]);

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}
