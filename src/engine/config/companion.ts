// Config: ดึ๋งๆ COMPANION entity (C4-MVP, DUNG_DUNG_COMPANION_GUIDE_SYSTEM_SPEC §12.2 + §5.1).
// Design Knob values + their types. Plain TS only (ห้าม import pixi / React / Next).
//
// D-068 PR8: follower model (ตามผู้เล่นตลอด) ถอดออก — `enabled` default = false, engine ข้าม createCompanion
// ทุก map. Type/ค่านี้เก็บไว้ให้ PR10 reuse ตอนทำ contextual companion (โผล่ตามบริบท ไม่ใช่ follower ถาวร).
// ทุกค่า = Design Knob (§48) — อ่านจาก config เท่านั้น.

export interface CompanionConfig {
  /** เปิดใช้ companion ไหม — false = ไม่ spawn เลย (engine ข้าม createCompanion). */
  enabled: boolean;
  /** assetId ของ atlas art (SVG-01) — peek ไม่เจอ → teal placeholder (fail-soft). */
  assetId: string;
  /** ระยะ trail ที่ต้องการอยู่ห่างผู้เล่น (tile) — จุด settle (§12.2 0.6–1.2 tile). */
  trailDistanceTiles: number;
  /** อยู่ในระยะนี้ (tile) = นิ่ง ไม่ขยับ (dead zone กัน orbit — settle แทนวนรอบตัว). */
  deadZoneTiles: number;
  /** ไกลเกินนี้ (tile) = teleport ตามทันที (§12.2 map transition/correction catch-up). */
  teleportDistanceTiles: number;
  /** ตัวคูณความเร็ว = player.speed × ค่านี้ (ไล่ตามช้า ๆ ให้ลากหลัง). */
  speedFactor: number;
  /** รัศมีคลิกโดน companion (tile) → เปิด help panel (§5.1). */
  clickRadiusTiles: number;
  /** ชื่อแสดงบนป้ายเหนือหัว (in-game content = ไทย). */
  displayName: string;
}

export const DEFAULT_COMPANION_CONFIG: CompanionConfig = {
  enabled: false, // D-068 PR8: follower model ถอดออก — PR10 จะเปิดใช้แบบ contextual
  assetId: "cmp_dungdung",
  trailDistanceTiles: 0.9, // กลาง ๆ ของ 0.6–1.2 tile trail (§12.2)
  deadZoneTiles: 0.9, // = trailDistance → ไล่จนถึง 0.9 tile แล้ว settle นิ่ง (ไม่ orbit)
  teleportDistanceTiles: 6, // §12.2 "very far (>6 tiles)" — หลังข้าม map / server correction
  speedFactor: 1.05, // ×player walk → ไล่ทันช้า ๆ
  clickRadiusTiles: 0.75, // = NPC_CLICK_RADIUS_TILES ให้ความรู้สึกคลิกสม่ำเสมอ
  displayName: "ดึ๋งๆ",
};
