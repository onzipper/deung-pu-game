"use client";

import { useMemo, useRef, useState } from "react";
import { validateCharacterName, CHARACTER_NAME_MAX } from "@/shared/character-name";
import { CLASS_IDS, type ClassId } from "@/shared/character-class";
import { classLabel, createCharacterErrorMessage, characterNameErrorMessage } from "./messages";
import type { CharacterView } from "@/server/characters/service";

// UI spec v1 §8 (Character Creation) — class list ซ้าย, preview กลาง (ตัดออก P2-06a: ยังไม่มี art/animation),
// ชื่อ+ยืนยันขวา · §7.6 validation: local ขณะพิมพ์ + server ตอน submit, error ใต้ field, duplicate name
// โฟกัสกลับ input + select text. P2 เล่นได้เฉพาะนักดาบ (decision-index 2026-07-12) — อีก 4 อาชีพ disabled.
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
    <div className="mx-auto w-full max-w-[1180px] rounded-[16px] border border-[#4A332E] bg-[#2B2230] p-6">
      <div className="mb-4 flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-[48px] items-center justify-center rounded-[10px] border border-[#68483A] px-4 text-[14px] text-[#F2D6A0] hover:bg-[#171820]"
        >
          ย้อนกลับ
        </button>
        <h1 className="text-[22px] font-bold text-[#F2D6A0]">สร้างนักผจญภัย</h1>
      </div>

      {slotsFull && (
        <div className="mb-4 rounded-[6px] border border-[#F4B852] bg-[#171820] px-4 py-3 text-[14px] text-[#F4B852]">
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
                className={`flex min-h-[48px] shrink-0 items-center justify-between rounded-[10px] border px-4 text-[14px] transition-colors ${
                  selected
                    ? "border-[#35C6B0] bg-[#171820] text-[#7CE9D0]"
                    : "border-[#68483A] bg-transparent text-[#D8AE70]"
                } ${c.playable ? "hover:border-[#35C6B0]" : "cursor-not-allowed opacity-50"}`}
              >
                <span>{classLabel(c.id)}</span>
                {!c.playable && <span className="ml-2 text-[12px]">เร็ว ๆ นี้</span>}
              </button>
            );
          })}
        </div>

        {/* Preview placeholder — art/animation ไม่อยู่ scope P2-06a */}
        <div className="flex min-h-[240px] items-center justify-center rounded-[10px] border border-[#68483A] bg-[#171820] text-[#8E6046]">
          <span className="text-[64px]">{classLabel(classId).charAt(0)}</span>
        </div>

        {/* Name + submit */}
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label htmlFor="char-name" className="mb-1 block text-[14px] text-[#D8AE70]">
              ชื่อตัวละคร
            </label>
            <input
              id="char-name"
              ref={nameInputRef}
              className="w-full min-h-[48px] rounded-[6px] border border-[#68483A] bg-[#171820] px-4 text-[16px] text-[#F2D6A0] focus:outline-none focus:ring-2 focus:ring-[#35C6B0]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={CHARACTER_NAME_MAX + 4}
              placeholder="ตั้งชื่อผู้กล้าของคุณ"
            />
            <div className="mt-1 flex items-center justify-between text-[12px]">
              <span className={name.length > 0 && !nameValidation.ok ? "text-[#D84848]" : "text-transparent"}>
                {!nameValidation.ok ? characterNameErrorMessage(nameValidation.reason) : "ok"}
              </span>
              <span className="text-[#8E6046]">
                {Array.from(name).length} / {CHARACTER_NAME_MAX}
              </span>
            </div>
          </div>

          <p className="text-[14px] text-[#D8AE70]">
            {classId === "swordsman"
              ? "แนวหน้า พลังโจมตีสูง ทนทาน — จุดเด่นของนักดาบ"
              : ""}
          </p>

          {submitError && (
            <div
              role="alert"
              className="rounded-[6px] border border-[#D84848] bg-[#171820] px-4 py-3 text-[14px] text-[#D84848]"
            >
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={!localValid || loading || slotsFull}
            className="mt-2 min-h-[48px] rounded-[10px] bg-[#35C6B0] px-5 text-[16px] font-semibold text-[#171820] transition-colors hover:bg-[#7CE9D0] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "กำลังสร้าง..." : "สร้างตัวละคร"}
          </button>
        </form>
      </div>
    </div>
  );
}
