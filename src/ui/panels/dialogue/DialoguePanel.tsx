"use client";

// Dialogue panel เนื้อหา (LW0 static NPC bark) — โชว์ชื่อ NPC + บทพูดทีละบรรทัด, กด "ถัดไป" ไปเรื่อย ๆ จนจบ
// แล้วปิดเอง (หรือกด "ปิด" ก่อนถึงบรรทัดสุดท้ายก็ได้ผ่านปุ่มปิด title bar/Esc).
//
// เปิดจาก activeDialogue (engine ตั้งตอนคลิกโดน NPC ในโลก, src/engine/runtime/app.ts onPointerDown) —
// auto-open ผ่าน effect (ต่างจาก panel อื่นที่เปิดด้วยปุ่ม HUD ตรง ๆ เพราะ trigger มาจากคลิกในโลก ไม่ใช่ปุ่ม UI).
// ปิด (title bar/Esc/กด "ปิด" หลังบรรทัดสุดท้าย) → เคลียร์ activeDialogue ผ่าน EngineHandle.closeDialogue()
// เสมอ (ui.md contract: ห้าม UI เขียน gameStore เอง, pattern เดียวกับ setDepthDebug/setEffectQuality).
//
// TODO LW1: full NPC routine/dialogueSetId system (Living World Bible §5.2) — รอบนี้ one-shot bark เท่านั้น.

import { useEffect, useState } from "react";
import type { EngineHandle } from "@/engine/runtime/app";
import { Panel, usePanelManager } from "@/ui/panels";
import { Button } from "@/ui/components";
import { selectActiveDialogue } from "@/ui/store/game-store";
import { useGameStore } from "@/ui/store/use-game-store";
import { DIALOGUE_PANEL_ID } from "./dialogue-view";

export interface DialoguePanelProps {
  /** อ่าน engine handle ปัจจุบัน (pattern เดียวกับ ShopPanel/SettingsPanel — เรียกใหม่ทุกครั้ง ไม่ cache) */
  getHandle: () => EngineHandle | null;
}

export function DialoguePanel({ getHandle }: DialoguePanelProps) {
  const manager = usePanelManager();
  const activeDialogue = useGameStore(selectActiveDialogue);
  const isOpen = manager.isPanelOpen(DIALOGUE_PANEL_ID);
  const [lineIndex, setLineIndex] = useState(0);

  // NPC ใหม่ถูกคลิก (npcId เปลี่ยน/ตั้งค่าใหม่) → เปิด panel + กลับบรรทัดแรกเสมอ. setState เกิดใน setTimeout
  // callback (deferred, ไม่ใช่ตรงใน effect body — pattern เดียวกับ HelpPanel/ShopPanel) จึงไม่ผิด
  // react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!activeDialogue) return;
    const timer = setTimeout(() => {
      manager.openPanel(DIALOGUE_PANEL_ID);
      setLineIndex(0);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDialogue?.npcId]);

  // panel ถูกปิดจากทาง title bar/Esc (ไม่ผ่าน onNext ด้านล่าง) ระหว่าง activeDialogue ยังค้างอยู่ → เคลียร์
  // ผ่าน engine (ครอบ path ปิดที่ไม่ใช่ปุ่ม "ปิด" ในนี้ — onNext เคลียร์เองไปแล้วตรง ๆ ในกรณีนั้น).
  useEffect(() => {
    if (isOpen || !activeDialogue) return;
    const timer = setTimeout(() => getHandle()?.closeDialogue(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!activeDialogue) return null;

  const lines = activeDialogue.lines;
  const isLast = lineIndex >= lines.length - 1;

  const onNext = (): void => {
    if (isLast) {
      manager.closePanel(DIALOGUE_PANEL_ID);
      getHandle()?.closeDialogue();
      return;
    }
    setLineIndex((i) => i + 1);
  };

  return (
    <Panel id={DIALOGUE_PANEL_ID} title={activeDialogue.displayName} widthPx={380}>
      <div className="dp-text-body-sm flex flex-col gap-3">
        <p className="text-(--dp-parchment)">{lines[lineIndex]}</p>
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={onNext}>
            {isLast ? "ปิด" : "ถัดไป"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
