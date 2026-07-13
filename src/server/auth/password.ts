// P2-03 — password hashing (node:crypto scrypt). Source: spec §1.4 hashing: argon2id-or-equivalent.
//
// เลือก scrypt (built-in node:crypto) เป็น "equivalent":
//   - argon2/bcrypt npm = native addon (node-gyp) → เปราะบน Windows dev + Render + Next 16 bleeding edge
//   - scrypt = memory-hard KDF, OWASP-accepted alternative เมื่อ argon2id ใช้ไม่ได้ → zero native dep = auditable
// เก็บ params ในตัว hash (`scrypt$N$r$p$saltB64$hashB64`) → migrate เป็น argon2id ภายหลังได้ด้วย prefix detection.
//
// ⛔ SERVER-ONLY (node:crypto). pure I/O (ไม่มี DB/env) → เทสต์ hash→verify roundtrip ได้ตรง ๆ.

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const ALGO = "scrypt";
// cost: N=2^15 (32768) ~ interactive-safe; maxmem ต้องพอสำหรับ 128*N*r ไบต์ (+เผื่อ)
const N = 1 << 15;
const R = 8;
const P = 1;
const KEYLEN = 32;
const SALT_LEN = 16;
const MAXMEM = 64 * 1024 * 1024;

/** hash รหัสผ่านเป็น string self-describing (algo+params+salt+hash) — เก็บลง Account.passwordHash. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const derived = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return [ALGO, N, R, P, salt.toString("base64"), derived.toString("base64")].join("$");
}

/** verify แบบ constant-time. คืน false ถ้ารูปแบบ hash ผิด/algo ไม่รู้จัก (ไม่ throw → กัน oracle). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 6) return false;
  const [algo, nStr, rStr, pStr, saltB64, hashB64] = parts;
  if (algo !== ALGO) return false;
  const n = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64, "base64");
    expected = Buffer.from(hashB64, "base64");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  let derived: Buffer;
  try {
    derived = await scrypt(password, salt, expected.length, { N: n, r, p, maxmem: MAXMEM });
  } catch {
    return false;
  }
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
