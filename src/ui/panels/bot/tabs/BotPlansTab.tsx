"use client";

// M4 แท็บ "แผนฟาร์ม" — รายการแผน (การ์ดคลิกเพื่อเลือกเป็น "แผนที่ใช้งาน" สำหรับ CTA เดียวที่ Overview) +
// editor (BotPlanEditor, 3 คอลัมน์ desktop/stack มือถือ). สร้าง/แก้ไข/ลบผ่าน net intent เดิม (sendBotProfile*)
// — component นี้แค่ประกอบฟอร์ม/ส่ง ไม่มี business rule เอง (อยู่ bot-view.ts/bot-layout.ts).

import { useEffect, useState } from "react";
import type { BotProfileWire, BotTierCapsWire, BotTierWire } from "@/shared/net-protocol";
import { Button, ConfirmDialog } from "@/ui/components";
import {
  botMapLabel,
  botPocketLabel,
  botTargetSummaryLabel,
  canCreateMoreProfiles,
  countBotRules,
  profileCountLabel,
  ruleCountLabel,
  type BotOpPhase,
} from "../bot-view";
import { blankBotProfileForm, editBotProfileForm, type BotProfileFormState } from "../bot-layout";
import { BotPlanEditor } from "../editor/BotPlanEditor";
import type { BotNet } from "../BotPanel";

export interface BotPlansTabProps {
  profiles: BotProfileWire[] | null;
  tier: BotTierWire;
  caps: BotTierCapsWire | null;
  busy: boolean;
  /** phase ปัจจุบันของ op เดียวที่ทำได้ทีละอัน (BotPanel.tsx) — ใช้ปิดฟอร์ม/ล้าง delete target เฉพาะตอนสำเร็จจริง
   * (deferred จนกว่า server ตอบกลับ, ไม่ optimistic — pattern เดียวกับ PR7 เดิม). อ้างอิงเปลี่ยนเฉพาะตอน setPhase
   * ถูกเรียกจริงเท่านั้น (ไม่ผูกกับ re-render อื่นของ store เช่น status tick) จึง effect ด้านล่างไม่ยิงมั่ว. */
  phase: BotOpPhase;
  selectedProfileId: string | null;
  runningProfileId: string | null;
  onSelect: (id: string) => void;
  send: (op: string, fn: (net: BotNet) => void) => void;
}

export function BotPlansTab({ profiles, tier, caps, busy, phase, selectedProfileId, runningProfileId, onSelect, send }: BotPlansTabProps) {
  const [form, setForm] = useState<BotProfileFormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BotProfileWire | null>(null);

  useEffect(() => {
    if (phase.kind !== "settled" || !phase.result.ok) return;
    const op = phase.result.op;
    // deferred setState (react-hooks/set-state-in-effect) — pattern เดียวกับ BotPanel.tsx เดิม (PR7)
    const timer = setTimeout(() => {
      if (op === "profileCreate" || op === "profileUpdate") setForm(null);
      if (op === "profileDelete") setDeleteTarget(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [phase]);

  const onSubmitForm = (): void => {
    if (!form || busy) return;
    if (form.mode === "create") {
      send("profileCreate", (net) => net.sendBotProfileCreate({ name: form.name.trim(), mapId: form.mapId, pocketId: form.pocketId, rules: form.rules }));
    } else if (form.id) {
      send("profileUpdate", (net) => net.sendBotProfileUpdate({ id: form.id!, name: form.name.trim(), mapId: form.mapId, pocketId: form.pocketId, rules: form.rules }));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-(--dp-sand)">{caps ? profileCountLabel(profiles?.length ?? 0, caps.profiles) : "—"}</span>
        <Button
          variant="primary"
          size="sm"
          disabled={busy || form !== null || (caps !== null && !canCreateMoreProfiles(profiles?.length ?? 0, caps.profiles))}
          onClick={() => setForm(blankBotProfileForm())}
        >
          + สร้างแผนใหม่
        </Button>
      </div>

      {(!profiles || profiles.length === 0) && !form && <div className="text-(--dp-sand)">— ยังไม่มีแผน —</div>}

      {!form &&
        profiles?.map((p) => {
          const isSelected = p.id === selectedProfileId;
          const isRunning = p.id === runningProfileId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className={[
                "dp-focus-ring flex flex-col gap-1.5 rounded-(--dp-radius-sm) border px-3 py-2 text-left transition-colors",
                isSelected ? "border-(--dp-resonance-teal) bg-(--dp-selected-wash)" : "border-(--dp-soil-brown) bg-(--dp-warm-ink) hover:bg-(--dp-deep-brown)",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-(--dp-parchment)">
                  {p.name}
                  {p.readOnly && <span className="ml-1 dp-text-caption text-(--dp-fire-light)">(ถูกพัก, อ่านอย่างเดียว)</span>}
                  {isRunning && <span className="ml-1 dp-text-caption text-(--dp-resonance-light)">กำลังทำงาน</span>}
                </span>
                <span className="dp-text-caption text-(--dp-sand)">{caps ? ruleCountLabel(countBotRules(p.rules), caps.rules) : ""}</span>
              </div>
              <div className="dp-text-caption text-(--dp-sand)">
                {botMapLabel(p.mapId)} · {botPocketLabel(p.pocketId)} · {botTargetSummaryLabel(p.rules)}
              </div>
              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                <Button variant="secondary" size="sm" disabled={busy || p.readOnly} onClick={() => setForm(editBotProfileForm(p))}>
                  แก้ไข
                </Button>
                <Button variant="destructive" size="sm" disabled={busy || isRunning} onClick={() => setDeleteTarget(p)}>
                  ลบ
                </Button>
              </div>
            </button>
          );
        })}

      {form && (
        <BotPlanEditor form={form} tier={tier} caps={caps} disabled={busy} onChange={setForm} onCancel={() => setForm(null)} onSubmit={onSubmitForm} />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="ลบแผน"
        description={deleteTarget ? `ลบแผน "${deleteTarget.name}" ถาวร — ต้องสร้างใหม่ถ้าต้องการใช้อีก` : undefined}
        variant="high-risk"
        requireCheckbox
        checkboxLabel="เข้าใจแล้วว่าแผนนี้จะถูกลบถาวร"
        confirmLabel="ลบ"
        cancelLabel="ยกเลิก"
        committing={busy}
        onConfirm={() => {
          if (!deleteTarget) return;
          send("profileDelete", (net) => net.sendBotProfileDelete({ id: deleteTarget.id }));
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
