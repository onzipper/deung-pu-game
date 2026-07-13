"use client";

import { useMemo, useRef, useState } from "react";
import { validateCharacterName, CHARACTER_NAME_MAX } from "@/shared/character-name";
import { CLASS_IDS, type ClassId } from "@/shared/character-class";
import { classLabel, createCharacterErrorMessage, characterNameErrorMessage } from "./messages";
import type { CharacterView } from "@/server/characters/service";

// UI spec v1 §8 (Character Creation) — class list ซ้าย, preview กลาง (ตัดออก P2-06a: ยังไม่มี art/animation),
// ชื่อ+ยืนยันขวา · §7.6 validation: local ขณะพิมพ์ + server ตอน submit, error ใต้ field, duplicate name
// โฟกัสกลับ input + select text. P2 เล่นได้เฉพาะนักดาบ (decision-index 2026-07-12) — อีก 4 อาชีพ disabled.
// Token-driven (src/app/globals.css --dp-*) — was inline hex, migrated in the E6 visual-foundation pass.
const DISPLAY_CLASSES: { id: string; playable: boolean }[] = [
  { id: "swordsman", playable: true },
  { id: "archer", playable: false },
  { id: "spearman", playable: false },
  { id: "mage", playable: false },
  { id: "occultist", playable: false },
];

export function CharacterCreate({
  slotsFull,
  onCreated,
  onBack,
}: {
  slotsFull: boolean;
  onCreated: (character: CharacterView) => void;
  onBack: () => void;
}): React.JSX.Element {
  const [classId, setClassId] = useState<ClassId>("swordsman");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const nameValidation = useMemo(() => validateCharacterName(name), [name]);
  const localValid = nameValidation.ok && (CLASS_IDS as readonly string[]).includes(classId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!localValid || loading || slotsFull) return;
    setLoading(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, classId }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        character?: CharacterView;
        reason?: string;
        nameError?: string;
      };
      if (!res.ok || !body.ok || !body.character) {
        setSubmitError(createCharacterErrorMessage(body.reason ?? "internal_error", body.nameError));
        if (body.reason === "name_taken") {
          nameInputRef.current?.focus();
          nameInputRef.current?.select();
        }
        return;
      }
      onCreated(body.character);
    } catch {
      setSubmitError(createCharacterErrorMessage("internal_error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1180px] rounded-(--dp-radius-lg) border border-(--dp-deep-brown) bg-(--dp-warm-ink) p-6">
      <div className="mb-4 flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-[48px] items-center justify-center rounded-(--dp-radius-md) border border-(--dp-soil-brown) px-4 text-[14px] text-(--dp-parchment) hover:bg-(--dp-deep-ink)"
        >
          ย้อนกลับ
        </button>
        <h1 className="text-[22px] font-bold text-(--dp-parchment)">สร้างนักผจญภัย</h1>
      </div>

      {slotsFull && (
        <div className="mb-4 rounded-(--dp-radius-sm) border border-(--dp-fire-light) bg-(--dp-deep-ink) px-4 py-3 text-[14px] text-(--dp-fire-light)">
          ใช้ครบ 5/5 ช่องแล้ว
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr_320px]">
        {/* Class list */}
        <div className="flex flex-row gap-2 overflow-x-auto lg:flex-col">
          {DISPLAY_CLASSES.map((c) => {
            const selected = c.playable && classId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                disabled={!c.playable}
                onClick={() => c.playable && setClassId(c.id as ClassId)}
                className={`flex min-h-[48px] shrink-0 items-center justify-between rounded-(--dp-radius-md) border px-4 text-[14px] transition-colors ${
                  selected
                    ? "border-(--dp-resonance-teal) bg-(--dp-deep-ink) text-(--dp-resonance-light)"
                    : "border-(--dp-soil-brown) bg-transparent text-(--dp-sand)"
                } ${c.playable ? "hover:border-(--dp-resonance-teal)" : "cursor-not-allowed opacity-50"}`}
              >
                <span>{classLabel(c.id)}</span>
                {!c.playable && <span className="ml-2 text-[12px]">เร็ว ๆ นี้</span>}
              </button>
            );
          })}
        </div>

        {/* Preview placeholder — art/animation ไม่อยู่ scope P2-06a */}
        <div className="flex min-h-[240px] items-center justify-center rounded-(--dp-radius-md) border border-(--dp-soil-brown) bg-(--dp-deep-ink) text-(--dp-clay)">
          <span className="text-[64px]">{classLabel(classId).charAt(0)}</span>
        </div>

        {/* Name + submit */}
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label htmlFor="char-name" className="mb-1 block text-[14px] text-(--dp-sand)">
              ชื่อตัวละคร
            </label>
            <input
              id="char-name"
              ref={nameInputRef}
              className="w-full min-h-[48px] rounded-(--dp-radius-sm) border border-(--dp-soil-brown) bg-(--dp-deep-ink) px-4 text-[16px] text-(--dp-parchment) focus:outline-none focus:ring-2 focus:ring-(--dp-resonance-teal)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={CHARACTER_NAME_MAX + 4}
              placeholder="ตั้งชื่อผู้กล้าของคุณ"
            />
            <div className="mt-1 flex items-center justify-between text-[12px]">
              <span className={name.length > 0 && !nameValidation.ok ? "text-(--dp-danger-red)" : "text-transparent"}>
                {!nameValidation.ok ? characterNameErrorMessage(nameValidation.reason) : "ok"}
              </span>
              <span className="text-(--dp-clay)">
                {Array.from(name).length} / {CHARACTER_NAME_MAX}
              </span>
            </div>
          </div>

          <p className="text-[14px] text-(--dp-sand)">
            {classId === "swordsman"
              ? "แนวหน้า พลังโจมตีสูง ทนทาน — จุดเด่นของนักดาบ"
              : ""}
          </p>

          {submitError && (
            <div
              role="alert"
              className="rounded-(--dp-radius-sm) border border-(--dp-danger-red) bg-(--dp-deep-ink) px-4 py-3 text-[14px] text-(--dp-danger-red)"
            >
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={!localValid || loading || slotsFull}
            className="mt-2 min-h-[48px] rounded-(--dp-radius-md) bg-(--dp-resonance-teal) px-5 text-[16px] font-semibold text-(--dp-deep-ink) transition-colors hover:bg-(--dp-resonance-light) disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "กำลังสร้าง..." : "สร้างตัวละคร"}
          </button>
        </form>
      </div>
    </div>
  );
}
