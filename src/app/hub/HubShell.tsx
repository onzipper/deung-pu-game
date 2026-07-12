"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CharacterView } from "@/server/characters/service";
import { AuthPanel } from "./AuthPanel";
import { ContinueCard } from "./ContinueCard";
import { CharacterGrid } from "./CharacterGrid";
import { CharacterCreate } from "./CharacterCreate";
import { UpgradePanel } from "./UpgradePanel";

type View = "hub" | "create" | "upgrade";

const MAX_SLOTS = 5;

// UI spec v1 §6/§7/§9 + Storage §5 (entry flow state machine) — orchestrator ของ Game Hub route เดียว
// (S4 decision-index: Game Hub = route ใน Next.js app เดิม ไม่ใช่หลาย URL ต่อ screen).
export function HubShell({
  authenticated,
  isGuest,
  initialCharacters,
}: {
  authenticated: boolean;
  isGuest: boolean;
  initialCharacters: CharacterView[];
}): React.JSX.Element {
  const router = useRouter();
  const [characters, setCharacters] = useState<CharacterView[]>(initialCharacters);
  const [view, setView] = useState<View>("hub");
  // guest ที่ยังไม่เชื่อม email ต้อง confirm ก่อน logout จริง — session guest = cookie อย่างเดียว
  // ล้างแล้วกลับเข้าบัญชีเดิมไม่ได้ (ไม่มี credential ให้ re-auth). ยืนยันด้วย state เดียวกันแทน window.confirm.
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      router.refresh();
    } finally {
      setLoggingOut(false);
      setConfirmingLogout(false);
    }
  }

  if (!authenticated) {
    return (
      <main className="flex min-h-full flex-1 flex-col items-center justify-center bg-[#171820] p-4">
        <AuthPanel />
      </main>
    );
  }

  const slotsFull = characters.length >= MAX_SLOTS;
  // TODO(P2-05): lastPlayedCharacterId ยังไม่ persist — ใช้ตัวแรกในลิสต์เป็น continue target ไปก่อน (§7.2 note)
  const continueCharacter = characters[0] ?? null;

  if (view === "create") {
    return (
      <main className="min-h-full flex-1 bg-[#171820] p-4 sm:p-8">
        <CharacterCreate
          slotsFull={slotsFull}
          onBack={() => setView("hub")}
          onCreated={(character) => {
            setCharacters((prev) => [...prev, character]);
            setView("hub");
          }}
        />
      </main>
    );
  }

  if (view === "upgrade") {
    return (
      <main className="flex min-h-full flex-1 flex-col items-center justify-center bg-[#171820] p-4">
        <UpgradePanel onBack={() => setView("hub")} />
      </main>
    );
  }

  return (
    <main className="min-h-full flex-1 bg-[#171820] p-4 sm:p-8">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-[28px] font-bold text-[#F2D6A0]">ดึ๋งปุ๊</h1>
          <div className="flex items-center gap-3">
            {isGuest && (
              <>
                <span className="rounded-full border border-[#68483A] px-4 py-1 text-[12px] text-[#D8AE70]">
                  Guest Account — ข้อมูลผูกกับอุปกรณ์นี้
                </span>
                <button
                  type="button"
                  className="flex min-h-[48px] items-center justify-center rounded-[10px] bg-[#35C6B0] px-4 text-[14px] font-semibold text-[#171820] transition-colors hover:bg-[#7CE9D0]"
                  onClick={() => setView("upgrade")}
                >
                  เชื่อม Email
                </button>
              </>
            )}
            {!confirmingLogout && (
              <button
                type="button"
                className="flex min-h-[48px] items-center justify-center rounded-[10px] border border-[#68483A] px-4 text-[14px] text-[#D8AE70] transition-colors hover:bg-[#2B2230]"
                onClick={() => (isGuest ? setConfirmingLogout(true) : handleLogout())}
                disabled={loggingOut}
              >
                ออกจากระบบ
              </button>
            )}
          </div>
        </header>

        {confirmingLogout && (
          <div
            role="alertdialog"
            className="flex flex-col gap-3 rounded-[10px] border border-[#F4B852] bg-[#2B2230] px-4 py-3 text-[14px] text-[#F2D6A0] sm:flex-row sm:items-center sm:justify-between"
          >
            <span>
              บัญชี Guest ยังไม่เชื่อม Email — ออกจากระบบแล้วจะกลับเข้าบัญชีนี้ไม่ได้
            </span>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="min-h-[48px] rounded-[10px] border border-[#68483A] px-4 text-[14px] text-[#D8AE70] hover:bg-[#171820]"
                onClick={() => setConfirmingLogout(false)}
                disabled={loggingOut}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="min-h-[48px] rounded-[10px] bg-[#D84848] px-4 text-[14px] font-semibold text-[#171820] hover:bg-[#E97070]"
                onClick={handleLogout}
                disabled={loggingOut}
              >
                {loggingOut ? "กำลังออก..." : "ยืนยันออกจากระบบ"}
              </button>
            </div>
          </div>
        )}

        {continueCharacter && (
          <ContinueCard character={continueCharacter} onManageClick={() => setView("hub")} />
        )}

        <CharacterGrid characters={characters} onCreateClick={() => !slotsFull && setView("create")} />
      </div>
    </main>
  );
}
