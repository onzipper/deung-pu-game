// P2-03 — secret access (server-only).
//
// JWT_SECRET  = ลง realtime handshake token (แชร์กับ Colyseus server P2-04 เพื่อ verify)
// SESSION_SECRET = ลง session cookie ฝั่ง Next เท่านั้น (realtime server ไม่ควรเซ็น web session ได้ = แยก secret)
//
// ⛔ ถ้า env ว่าง → throw ทันที (ไม่รันด้วย secret เดา/hardcode). ค่าจริงอยู่ .env (gitignored) —
//    generate ด้วย `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
//    .env.example มี key เปล่าไว้เป็น checklist.

function requireSecret(name: "JWT_SECRET" | "SESSION_SECRET"): string {
  const value = process.env[name];
  if (!value || value.length < 16) {
    throw new Error(
      `[auth] ${name} ไม่ถูกตั้ง (หรือสั้นเกินไป) — ตั้งค่าสุ่มยาวใน .env. ` +
        "ห้าม hardcode/commit; generate ด้วย crypto.randomBytes.",
    );
  }
  return value;
}

export function getJwtSecret(): string {
  return requireSecret("JWT_SECRET");
}

export function getSessionSecret(): string {
  return requireSecret("SESSION_SECRET");
}
