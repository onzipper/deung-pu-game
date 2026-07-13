// Dialogue panel view (LW0 static NPC bark) — panel id only; state (บรรทัดปัจจุบัน) ง่ายพอจึงอยู่ใน
// DialoguePanel.tsx ตรง ๆ ไม่แยก pure module เพิ่ม (เหมือน settings-view.ts ที่มีแค่ id + glue เมื่อไม่มี
// state machine ซับซ้อนพอจะคุ้มแยก).

import type { PanelId } from "@/ui/panels";

export const DIALOGUE_PANEL_ID: PanelId = "dialogue";
