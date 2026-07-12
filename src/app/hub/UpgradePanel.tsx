"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authErrorMessage } from "./messages";

// Guest → Email upgrade (owner-report bug #7 fix) — Storage §1.2/§1.7/§1.9 + §4 (LOGOUT/ACCOUNT_SETTINGS
// transitions ยืนยันว่า guest ต้องเชื่อม email ได้จาก Game Hub) + endpoint contract:
// POST /api/auth/upgrade { email, emailConfirm, password } — session-gated, idempotent (§1.7 duplicate submit).
// สไตล์/ token เดียวกับ AuthPanel mode "register" (V1 tokens: radius 6/10/16, hit area >=48px).
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
    "w-full min-h-[48px] rounded-[6px] border border-[#68483A] bg-[#171820] px-4 text-[16px] text-[#F2D6A0] placeholder:text-[#8E6046] focus:outline-none focus:ring-2 focus:ring-[#35C6B0]";
  const primaryBtnClass =
    "w-full min-h-[48px] rounded-[10px] bg-[#35C6B0] px-5 text-[16px] font-semibold text-[#171820] transition-colors hover:bg-[#7CE9D0] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="mx-auto w-full max-w-[420px] rounded-[16px] border border-[#4A332E] bg-[#2B2230] p-6 shadow-lg">
      <h1 className="mb-1 text-center text-[22px] font-bold text-[#F2D6A0]">เชื่อม Email เข้าบัญชี</h1>
      <p className="mb-6 text-center text-[14px] text-[#D8AE70]">
        ตัวละครและข้อมูลเดิมจะยังอยู่ครบ — แค่เพิ่ม Email/รหัสผ่านให้บัญชี Guest นี้
      </p>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-[6px] border border-[#D84848] bg-[#171820] px-4 py-3 text-[14px] text-[#D84848]"
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
          className="min-h-[48px] text-[14px] text-[#D8AE70]"
          disabled={loading}
          onClick={onBack}
        >
          ย้อนกลับ
        </button>
      </form>
    </div>
  );
}
