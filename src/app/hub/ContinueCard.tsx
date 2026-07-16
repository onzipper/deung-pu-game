"use client";

import Link from "next/link";
import type { CharacterView } from "@/server/characters/service";
import { classLabel } from "./messages";
import { rememberSelectedCharacter } from "./enter-game";

// UI spec v1 §7 (Continue Card) — Continue = primary CTA (single-click), Change Character = secondary.
// P2-05: "เข้าเกม" จำ characterId ลง sessionStorage ก่อน navigate → /game join ด้วยตัวละครนี้ (server load state).
// lastPlayedCharacterId ยังไม่ persist ฝั่ง hub (TODO) → ใช้ตัวแรกในลิสต์ไปก่อน (caller ส่ง character มาให้แล้ว).
// Token-driven (src/app/globals.css --dp-*) — was inline hex, migrated in the E6 visual-foundation pass.
export function ContinueCard({
  character,
  onManageClick,
}: {
  character: CharacterView | null;
  onManageClick: () => void;
}): React.JSX.Element {
  if (!character) return <></>;

  return (
    <div className="rounded-(--dp-radius-lg) border border-(--dp-deep-brown) bg-(--dp-warm-ink) p-6">
      <p className="mb-1 text-[12px] uppercase tracking-wide text-(--dp-sand)">เล่นต่อจากครั้งก่อน</p>
      <div className="mb-4 flex items-center gap-4">
        <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-(--dp-radius-md) border border-(--dp-soil-brown) bg-(--dp-deep-ink) text-[28px] text-(--dp-resonance-light) sm:h-[96px] sm:w-[96px]">
          {character.name.charAt(0)}
        </div>
        <div>
          <p className="text-[22px] font-semibold text-(--dp-parchment)">{character.name}</p>
          <p className="text-[14px] text-(--dp-sand)">
            {classLabel(character.classId)} · Lv.{character.level}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/game"
          onClick={() => rememberSelectedCharacter(character.id, character.lastMapId, character.classId)}
          className="flex min-h-[48px] flex-1 items-center justify-center rounded-(--dp-radius-md) bg-(--dp-resonance-teal) px-5 text-[16px] font-semibold text-(--dp-deep-ink) transition-colors hover:bg-(--dp-resonance-light)"
        >
          เข้าเกม
        </Link>
        <button
          type="button"
          onClick={onManageClick}
          className="flex min-h-[48px] items-center justify-center rounded-(--dp-radius-md) border border-(--dp-soil-brown) bg-transparent px-5 text-[14px] font-medium text-(--dp-parchment) transition-colors hover:bg-(--dp-deep-ink)"
        >
          เปลี่ยนตัวละคร
        </button>
      </div>
    </div>
  );
}
