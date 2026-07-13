"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authErrorMessage } from "./messages";

// Guest → Email upgrade (owner-report bug #7 fix) — Storage §1.2/§1.7/§1.9 + §4 (LOGOUT/ACCOUNT_SETTINGS
// transitions ยืนยันว่า guest ต้องเชื่อม email ได้จาก Game Hub) + endpoint contract:
// POST /api/auth/upgrade { email, emailConfirm, password } — session-gated, idempotent (§1.7 duplicate submit).
// สไตล์/ token เดียวกับ AuthPanel mode "register" (V1 tokens: radius 6/10/16, hit area >=48px).
// Token-driven (src/app/globals.css --dp-*) — was inline hex, migrated in the E6 visual-foundation pass.
export function UpgradePanel({ onBack }: { onBack: () => void }): React.JSX.Element {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [emailConfirm, setEmailConfirm] = useState("");
  const [password, setPassword] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, emailConfirm, password }),
      });
      const body = (await res.json()) as { ok: boolean; reason?: string };
      if (!res.ok || !body.ok) {
        setError(authErrorMessage(body.reason ?? "internal_error"));
        return;
      }
      // session claim isGuest=false ถูก set โดย route แล้ว — refresh ให้ Server Component (page.tsx) re-run
      // แล้วพากลับ hub ทันที (view เป็น client state ไม่ถูก reset ตอน refresh — ค้างหน้าฟอร์ม = ดูเหมือนนิ่ง)
      router.refresh();
      onBack();
    } catch {
      setError(authErrorMessage("network"));
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full min-h-[48px] rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-deep-ink) px-4 text-[16px] text-(--dp-parchment) placeholder:text-(--dp-clay) focus:outline-none focus:ring-2 focus:ring-(--dp-resonance-teal)";
  const primaryBtnClass =
    "w-full min-h-[48px] rounded-(--dp-radius-md) bg-(--dp-resonance-teal) px-5 text-[16px] font-semibold text-(--dp-deep-ink) transition-colors hover:bg-(--dp-resonance-light) disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="mx-auto w-full max-w-[420px] rounded-(--dp-radius-lg) border border-(--dp-deep-brown) bg-(--dp-warm-ink) p-6 dp-shadow-panel">
      <h1 className="mb-1 text-center text-[22px] font-bold text-(--dp-parchment)">เชื่อม Email เข้าบัญชี</h1>
      <p className="mb-6 text-center text-[14px] text-(--dp-sand)">
        ตัวละครและข้อมูลเดิมจะยังอยู่ครบ — แค่เพิ่ม Email/รหัสผ่านให้บัญชี Guest นี้
      </p>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-(--dp-radius-sm) border border-(--dp-danger-red) bg-(--dp-deep-ink) px-4 py-3 text-[14px] text-(--dp-danger-red)"
        >
          {error}
        </div>
      )}

      <form className="flex flex-col gap-3" onSubmit={submit}>
        <input
          className={inputClass}
          type="email"
          placeholder="อีเมล"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className={inputClass}
          type="email"
          placeholder="ยืนยันอีเมล"
          value={emailConfirm}
          onChange={(e) => setEmailConfirm(e.target.value)}
          required
        />
        <input
          className={inputClass}
          type="password"
          placeholder="รหัสผ่าน (อย่างน้อย 10 ตัวอักษร)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" className={primaryBtnClass} disabled={loading}>
          {loading ? "กำลังเชื่อมต่อ..." : "เชื่อม Email"}
        </button>
        <button
          type="button"
          className="min-h-[48px] text-[14px] text-(--dp-sand)"
          disabled={loading}
          onClick={onBack}
        >
          ย้อนกลับ
        </button>
      </form>
    </div>
  );
}
