"use client";

import Link from "next/link";
import type { CharacterView } from "@/server/characters/service";
import { classLabel } from "./messages";

const MAX_SLOTS = 5;

// UI spec v1 §9 (Character Management) — 5 slots, filled=Continue/Details, empty=Create.
// Details/Storage tabs = future (P2-06a scope: creation + management list เท่านั้น).
export function CharacterGrid({
  characters,
  onCreateClick,
}: {
  characters: CharacterView[];
  onCreateClick: () => void;
}): React.JSX.Element {
  const emptySlots = Math.max(0, MAX_SLOTS - characters.length);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[18px] font-semibold text-[#F2D6A0]">ตัวละครของฉัน</h2>
        <span className="text-[14px] text-[#D8AE70]">{characters.length} / {MAX_SLOTS} slots</span>
      </div>

      {characters.length === 0 && (
        <div className="mb-4 rounded-[10px] border border-[#68483A] bg-[#171820] p-4 text-[14px] text-[#D8AE70]">
          ยังไม่มีตัวละคร — สร้างตัวละครแรกเพื่อเริ่มผจญภัย
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {characters.map((c) => (
          <div
            key={c.id}
            className="flex min-h-[300px] flex-col justify-between rounded-[16px] border border-[#68483A] bg-[#2B2230] p-4"
          >
            <div>
              <div className="mb-3 flex h-[80px] w-[80px] items-center justify-center rounded-[10px] border border-[#68483A] bg-[#171820] text-[24px] text-[#7CE9D0]">
                {c.name.charAt(0)}
              </div>
              <p className="text-[18px] font-semibold text-[#F2D6A0]">{c.name}</p>
              <p className="text-[14px] text-[#D8AE70]">
                {classLabel(c.classId)} · Lv.{c.level}
              </p>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href="/game"
                className="flex min-h-[48px] items-center justify-center rounded-[10px] bg-[#35C6B0] px-4 text-[14px] font-semibold text-[#171820] hover:bg-[#7CE9D0]"
              >
                เข้าเกม
              </Link>
              <button
                type="button"
                disabled
                title="รายละเอียดตัวละคร — เร็ว ๆ นี้"
                className="flex min-h-[48px] items-center justify-center rounded-[10px] border border-[#68483A] bg-transparent px-4 text-[14px] font-medium text-[#8E6046] disabled:cursor-not-allowed"
              >
                รายละเอียด (เร็ว ๆ นี้)
              </button>
            </div>
          </div>
        ))}

        {Array.from({ length: emptySlots }).map((_, i) => (
          <button
            key={`empty-${i}`}
            type="button"
            onClick={onCreateClick}
            className="flex min-h-[300px] flex-col items-center justify-center gap-2 rounded-[16px] border border-dashed border-[#68483A] bg-transparent p-4 text-[#D8AE70] transition-colors hover:border-[#35C6B0] hover:text-[#7CE9D0]"
          >
            <span className="text-[32px]">+</span>
            <span className="text-[14px] font-medium">สร้างตัวละคร</span>
          </button>
        ))}
      </div>
    </div>
  );
}
