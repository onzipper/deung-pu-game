# D-044 — Auth: custom lightweight
- Date: 2026-07-12 · Status: Locked · Source row: docs/decision-index.md (2026-07-13 extraction)

## มติ + เหตุผล (verbatim)

Decision: **Auth = custom lightweight (supersede "Auth.js" ใน TA L-table)** — `node:crypto` ล้วน: HS256 signed token (pin header กัน alg-confusion, constant-time compare) + scrypt hash (OWASP equivalent ของ argon2id, self-describing format migrate ได้) + stateless httpOnly session cookie · JWT ~60s + jti สำหรับ WS handshake (P2-04) · เหตุผล: NextAuth v5 beta เสี่ยงชน Next รุ่นใหม่, guest→upgrade ไม่ใช่ provider flow, trust boundary ต้อง auditable · Auth.js กลับมาพิจารณาได้เมื่อ stable+ต้องการ social login

สถานะ: Locked

เหตุผล: tech เสนอจากการ implement จริง + owner เคาะ 2026-07-12
