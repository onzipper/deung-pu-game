"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authErrorMessage } from "./messages";

type Mode = "default" | "login" | "register";

// UI spec v1 §6 (Login/Guest Entry) — desktop panel 420px centered, primary=Continue/Guest, secondary=Email.
// V1 tokens (decision-index 2026-07-12): radius 6/10/16 + pill · touch/hit area >=48px.
export function AuthPanel(): React.JSX.Element {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("default");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [emailConfirm, setEmailConfirm] = useState("");
  const [password, setPassword] = useState("");

  async function submitGuest() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/guest", { method: "POST" });
      const body = (await res.json()) as { ok: boolean; reason?: string };
      if (!res.ok || !body.ok) {
        setError(authErrorMessage(body.reason ?? "internal_error"));
        return;
      }
      router.refresh();
    } catch {
      setError(authErrorMessage("network"));
    } finally {
      setLoading(false);
    }
  }

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await res.json()) as { ok: boolean; reason?: string };
      if (!res.ok || !body.ok) {
        setError(authErrorMessage(body.reason ?? "internal_error"));
        return;
      }
      router.refresh();
    } catch {
      setError(authErrorMessage("network"));
    } finally {
      setLoading(false);
    }
  }

  async function submitRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, emailConfirm, password }),
      });
      const body = (await res.json()) as { ok: boolean; reason?: string };
      if (!res.ok || !body.ok) {
        setError(authErrorMessage(body.reason ?? "internal_error"));
        return;
      }
      router.refresh();
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
  const secondaryBtnClass =
    "w-full min-h-[48px] rounded-[10px] border border-[#68483A] bg-transparent px-5 text-[16px] font-medium text-[#F2D6A0] transition-colors hover:bg-[#2B2230] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="mx-auto w-full max-w-[420px] rounded-[16px] border border-[#4A332E] bg-[#2B2230] p-6 shadow-lg">
      <h1 className="mb-1 text-center text-[28px] font-bold text-[#F2D6A0]">ดึ๋งปุ๊</h1>
      <p className="mb-6 text-center text-[14px] text-[#D8AE70]">
        เข้าเล่นแบบ Guest ได้ทันที หรือเข้าสู่ระบบด้วยอีเมล
      </p>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-[6px] border border-[#D84848] bg-[#171820] px-4 py-3 text-[14px] text-[#D84848]"
        >
          {error}
        </div>
      )}

      {mode === "default" && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            className={primaryBtnClass}
            disabled={loading}
            onClick={submitGuest}
          >
            {loading ? "กำลังเชื่อมต่อ..." : "เล่นแบบ Guest"}
          </button>
          <p className="text-center text-[12px] text-[#8E6046]">
            บัญชี Guest ผูกกับอุปกรณ์นี้ — เชื่อม Email ภายหลังได้
          </p>
          <button
            type="button"
            className={secondaryBtnClass}
            disabled={loading}
            onClick={() => setMode("login")}
          >
            เข้าสู่ระบบด้วย Email
          </button>
          <button
            type="button"
            className="min-h-[48px] text-[14px] text-[#7CE9D0] underline underline-offset-2"
            disabled={loading}
            onClick={() => setMode("register")}
          >
            ยังไม่มีบัญชี? สมัครสมาชิก
          </button>
        </div>
      )}

      {mode === "login" && (
        <form className="flex flex-col gap-3" onSubmit={submitLogin}>
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
            type="password"
            placeholder="รหัสผ่าน"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className={primaryBtnClass} disabled={loading}>
            {loading ? "กำลังเชื่อมต่อ..." : "เข้าสู่ระบบ"}
          </button>
          <button
            type="button"
            className="min-h-[48px] text-[14px] text-[#D8AE70]"
            disabled={loading}
            onClick={() => setMode("default")}
          >
            ย้อนกลับ
          </button>
        </form>
      )}

      {mode === "register" && (
        <form className="flex flex-col gap-3" onSubmit={submitRegister}>
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
            {loading ? "กำลังเชื่อมต่อ..." : "สมัครสมาชิก"}
          </button>
          <button
            type="button"
            className="min-h-[48px] text-[14px] text-[#D8AE70]"
            disabled={loading}
            onClick={() => setMode("default")}
          >
            ย้อนกลับ
          </button>
        </form>
      )}
    </div>
  );
}
