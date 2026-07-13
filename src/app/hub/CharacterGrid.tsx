"use client";

import Link from "next/link";
import type { CharacterView } from "@/server/characters/service";
import { classLabel } from "./messages";
import { rememberSelectedCharacter } from "./enter-game";

const MAX_SLOTS = 5;

// UI spec v1 §9 (Character Management) — 5 slots, filled=Continue/Details, empty=Create.
// Details/Storage tabs = future (P2-06a scope: creation + management list เท่านั้น).
// Token-driven (src/app/globals.css --dp-*) — was inline hex, migrated in the E6 visual-foundation pass.
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
        <h2 className="text-[18px] font-semibold text-(--dp-parchment)">ตัวละครของฉัน</h2>
        <span className="text-[14px] text-(--dp-sand)">{characters.length} / {MAX_SLOTS} slots</span>
      </div>

      {characters.length === 0 && (
        <div className="mb-4 rounded-(--dp-radius-md) border border-(--dp-soil-brown) bg-(--dp-deep-ink) p-4 text-[14px] text-(--dp-sand)">
          ยังไม่มีตัวละคร — สร้างตัวละครแรกเพื่อเริ่มผจญภัย
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {characters.map((c) => (
          <div
            key={c.id}
            className="flex min-h-[300px] flex-col justify-between rounded-(--dp-radius-lg) border border-(--dp-soil-brown) bg-(--dp-warm-ink) p-4"
          >
            <div>
              <div className="mb-3 flex h-[80px] w-[80px] items-center justify-center rounded-(--dp-radius-md) border border-(--dp-soil-brown) bg-(--dp-deep-ink) text-[24px] text-(--dp-resonance-light)">
                {c.name.charAt(0)}
              </div>
              <p className="text-[18px] font-semibold text-(--dp-parchment)">{c.name}</p>
              <p className="text-[14px] text-(--dp-sand)">
                {classLabel(c.classId)} · Lv.{c.level}
              </p>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href="/game"
                onClick={() => rememberSelectedCharacter(c.id, c.lastMapId)}
                className="flex min-h-[48px] items-center justify-center rounded-(--dp-radius-md) bg-(--dp-resonance-teal) px-4 text-[14px] font-semibold text-(--dp-deep-ink) hover:bg-(--dp-resonance-light)"
              >
                เข้าเกม
              </Link>
              <button
                type="button"
                disabled
                title="รายละเอียดตัวละคร — เร็ว ๆ นี้"
                className="flex min-h-[48px] items-center justify-center rounded-(--dp-radius-md) border border-(--dp-soil-brown) bg-transparent px-4 text-[14px] font-medium text-(--dp-clay) disabled:cursor-not-allowed"
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
            className="flex min-h-[300px] flex-col items-center justify-center gap-2 rounded-(--dp-radius-lg) border border-dashed border-(--dp-soil-brown) bg-transparent p-4 text-(--dp-sand) transition-colors hover:border-(--dp-resonance-teal) hover:text-(--dp-resonance-light)"
          >
            <span className="text-[32px]">+</span>
            <span className="text-[14px] font-medium">สร้างตัวละคร</span>
          </button>
        ))}
      </div>
    </div>
  );
}
