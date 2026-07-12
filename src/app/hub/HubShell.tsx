"use client";

import { useState } from "react";
import type { CharacterView } from "@/server/characters/service";
import { AuthPanel } from "./AuthPanel";
import { ContinueCard } from "./ContinueCard";
import { CharacterGrid } from "./CharacterGrid";
import { CharacterCreate } from "./CharacterCreate";

type View = "hub" | "create";

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
  const [characters, setCharacters] = useState<CharacterView[]>(initialCharacters);
  const [view, setView] = useState<View>("hub");

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

  return (
    <main className="min-h-full flex-1 bg-[#171820] p-4 sm:p-8">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
        <header className="flex items-center justify-between">
          <h1 className="text-[28px] font-bold text-[#F2D6A0]">ดึ๋งปุ๊</h1>
          {isGuest && (
            <span className="rounded-full border border-[#68483A] px-4 py-1 text-[12px] text-[#D8AE70]">
              Guest Account — ข้อมูลผูกกับอุปกรณ์นี้
            </span>
          )}
        </header>

        {continueCharacter && (
          <ContinueCard character={continueCharacter} onManageClick={() => setView("hub")} />
        )}

        <CharacterGrid characters={characters} onCreateClick={() => !slotsFull && setView("create")} />
      </div>
    </main>
  );
}
