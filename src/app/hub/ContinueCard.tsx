"use client";

import Link from "next/link";
import type { CharacterView } from "@/server/characters/service";
import { classLabel } from "./messages";

// UI spec v1 §7 (Continue Card) — Continue = primary CTA (single-click), Change Character = secondary.
// P2-06a scope: "เข้าเกม" แค่ลิงก์ไป /game เฉย ๆ — integration ตัวจริง (join room ด้วยตัวละครนี้) = issue ถัดไป.
// lastPlayedCharacterId ยังไม่ persist (TODO P2-05) → ใช้ตัวแรกในลิสต์ไปก่อน (caller ส่ง character มาให้แล้ว).
export function ContinueCard({
  character,
  onManageClick,
}: {
  character: CharacterView | null;
  onManageClick: () => void;
}): React.JSX.Element {
  if (!character) return <></>;

  return (
    <div className="rounded-[16px] border border-[#4A332E] bg-[#2B2230] p-6">
      <p className="mb-1 text-[12px] uppercase tracking-wide text-[#D8AE70]">เล่นต่อจากครั้งก่อน</p>
      <div className="mb-4 flex items-center gap-4">
        <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[10px] border border-[#68483A] bg-[#171820] text-[28px] text-[#7CE9D0] sm:h-[96px] sm:w-[96px]">
          {character.name.charAt(0)}
        </div>
        <div>
          <p className="text-[22px] font-semibold text-[#F2D6A0]">{character.name}</p>
          <p className="text-[14px] text-[#D8AE70]">
            {classLabel(character.classId)} · Lv.{character.level}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/game"
          className="flex min-h-[48px] flex-1 items-center justify-center rounded-[10px] bg-[#35C6B0] px-5 text-[16px] font-semibold text-[#171820] transition-colors hover:bg-[#7CE9D0]"
        >
          เข้าเกม
        </Link>
        <button
          type="button"
          onClick={onManageClick}
          className="flex min-h-[48px] items-center justify-center rounded-[10px] border border-[#68483A] bg-transparent px-5 text-[14px] font-medium text-[#F2D6A0] transition-colors hover:bg-[#171820]"
        >
          เปลี่ยนตัวละคร
        </button>
      </div>
    </div>
  );
}
