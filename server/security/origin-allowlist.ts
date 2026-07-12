// P2-04 — WS handshake origin allowlist (Bible 5.2, TA §6.2). Pure module (no env/IO read) → เทสต์ตรงได้.
//
// นโยบาย: allowlist มาจาก env `ALLOWED_ORIGINS` (comma-separated). **allowlist ว่าง = dev mode**
//   → อนุญาตทุก origin (caller log warning). ตั้ง allowlist แล้ว = production/staging → origin ต้องตรง exact
//   (และต้องมี Origin header จริง). browser ส่ง Origin header ทุก WS handshake — คนที่ไม่มี = ไม่ใช่ browser
//   ที่เราคาดหวังบน production → ปฏิเสธ.

/** parse env string → รายการ origin (trim, ตัดค่าว่าง). undefined/"" → [] (dev mode). */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * true = อนุญาตให้ handshake ต่อ. allowlist ว่าง → อนุญาตทุก origin (dev). allowlist ไม่ว่าง →
 * ต้องมี origin **และ** อยู่ใน allowlist แบบ exact match.
 */
export function isOriginAllowed(origin: string | undefined, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true; // dev mode — อนุญาตหมด
  if (!origin) return false; // production ที่ตั้ง allowlist แล้ว ต้องมี Origin header
  return allowlist.includes(origin);
}
