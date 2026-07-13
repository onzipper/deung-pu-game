"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authErrorMessage } from "./messages";

type Mode = "default" | "login" | "register";

// UI spec v1 §6 (Login/Guest Entry) — desktop panel 420px centered, primary=Continue/Guest, secondary=Email.
// V1 tokens (decision-index 2026-07-12): radius 6/10/16 + pill · touch/hit area >=48px.
// Token-driven (src/app/globals.css --dp-*) — was inline hex, migrated in the E6 visual-foundation pass.
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
    "w-full min-h-[48px] rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-deep-ink) px-4 text-[16px] text-(--dp-parchment) placeholder:text-(--dp-clay) focus:outline-none focus:ring-2 focus:ring-(--dp-resonance-teal)";
  const primaryBtnClass =
    "w-full min-h-[48px] rounded-(--dp-radius-md) bg-(--dp-resonance-teal) px-5 text-[16px] font-semibold text-(--dp-deep-ink) transition-colors hover:bg-(--dp-resonance-light) disabled:cursor-not-allowed disabled:opacity-50";
  const secondaryBtnClass =
    "w-full min-h-[48px] rounded-(--dp-radius-md) border border-(--dp-soil-brown) bg-transparent px-5 text-[16px] font-medium text-(--dp-parchment) transition-colors hover:bg-(--dp-warm-ink) disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="mx-auto w-full max-w-[420px] rounded-(--dp-radius-lg) border border-(--dp-deep-brown) bg-(--dp-warm-ink) p-6 dp-shadow-panel">
      <h1 className="mb-1 text-center text-[28px] font-bold text-(--dp-parchment)">ดึ๋งปุ๊</h1>
      <p className="mb-6 text-center text-[14px] text-(--dp-sand)">
        เข้าเล่นแบบ Guest ได้ทันที หรือเข้าสู่ระบบด้วยอีเมล
      </p>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-(--dp-radius-sm) border border-(--dp-danger-red) bg-(--dp-deep-ink) px-4 py-3 text-[14px] text-(--dp-danger-red)"
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
          <p className="text-center text-[12px] text-(--dp-clay)">
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
            className="min-h-[48px] text-[14px] text-(--dp-resonance-light) underline underline-offset-2"
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
            className="min-h-[48px] text-[14px] text-(--dp-sand)"
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
            className="min-h-[48px] text-[14px] text-(--dp-sand)"
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
