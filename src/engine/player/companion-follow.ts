// Companion follow math (C4-MVP, §12.2) — PURE, no PixiJS / React / Next (invariant engine layer).
// Extracted from companion.ts so the follow decisions (dead-zone / lerp-target / teleport-threshold)
// are unit-testable without pixi (same pattern as target-engage.ts / path-follower.ts).
//
// พฤติกรรม (§12.2): ตาม LOCAL player ที่ระยะ trail (0.6–1.2 tile). ขยับเข้าหาจุดที่ trailDistance จากผู้เล่น
// **เฉพาะเมื่อไกลกว่า deadZone** (dead zone → settle นิ่ง ไม่วนรอบตัว). ไกลมาก (>teleport) → snap ตามทันที
// (map transition / server correction catch-up). แยก calc ออกจาก render เตรียม server-authoritative (P1).

/** จุดบนกริด (foot, continuous tile-space). */
export interface CompanionPoint {
  tx: number;
  ty: number;
}

/** knob ที่ follow-step ต้องใช้ (companion.ts ประกอบจาก CompanionConfig + player.speed). */
export interface CompanionFollowParams {
  /** ระยะ trail ที่อยากอยู่ห่างผู้เล่น (tile) — จุด settle. */
  trailDistanceTiles: number;
  /** อยู่ในระยะนี้ (tile) = ไม่ขยับ (dead zone กัน orbit). */
  deadZoneTiles: number;
  /** ไกลเกินนี้ (tile) = teleport ตามทันที. */
  teleportDistanceTiles: number;
  /** ความเร็ว (tile/วินาที) = player walk × speedFactor. */
  speedTilesPerSec: number;
}

/** ผลลัพธ์ 1 step: ตำแหน่งถัดไป + สถานะ (moved→walk/idle, teleported, delta สำหรับ facing). */
export interface CompanionFollowResult {
  tx: number;
  ty: number;
  /** ขยับจริงเฟรมนี้ (→ walk anim); false = นิ่ง (→ idle). */
  moved: boolean;
  /** snap ตามทันที (teleport catch-up) — ไม่นับเป็น moved (ไม่เล่น walk). */
  teleported: boolean;
  /** เวกเตอร์ที่ขยับ (tile) — ใช้ derive facing; 0 เมื่อไม่ขยับ. */
  dx: number;
  dy: number;
}

const EPS = 1e-6;

/** unit vector จาก (x,y) — coincident (spawn) → default diagonal ให้ teleport ลง offset ไม่ทับผู้เล่น. */
function unitOrDefault(x: number, y: number, dist: number): { ux: number; uy: number } {
  if (dist > EPS) return { ux: x / dist, uy: y / dist };
  const inv = 1 / Math.SQRT2;
  return { ux: inv, uy: inv };
}

/**
 * เดิน companion 1 เฟรมเข้าหาผู้เล่น (pure, deterministic).
 * - dist > teleport → snap ไปจุด trailDistance จากผู้เล่น (บนแนวเดิม), teleported=true (ไม่ walk).
 * - dist ≤ deadZone → นิ่ง (settle, ไม่ orbit).
 * - deadZone < dist ≤ teleport → lerp เข้าหา target (จุด trailDistance จากผู้เล่น), clamp ด้วย speed·dt (ไม่ overshoot).
 */
export function stepCompanionFollow(
  state: CompanionPoint,
  playerPos: CompanionPoint,
  dtSeconds: number,
  cfg: CompanionFollowParams,
): CompanionFollowResult {
  // เวกเตอร์จากผู้เล่น → companion (ทิศที่ companion อยู่ปัจจุบัน)
  const offX = state.tx - playerPos.tx;
  const offY = state.ty - playerPos.ty;
  const dist = Math.hypot(offX, offY);

  // teleport catch-up (§12.2): ไกลมาก (หลังข้าม map / correction) → snap ไปจุด settle บนแนวเดิม
  if (dist > cfg.teleportDistanceTiles) {
    const { ux, uy } = unitOrDefault(offX, offY, dist);
    return {
      tx: playerPos.tx + ux * cfg.trailDistanceTiles,
      ty: playerPos.ty + uy * cfg.trailDistanceTiles,
      moved: false,
      teleported: true,
      dx: 0,
      dy: 0,
    };
  }

  // dead zone: ใกล้พอแล้ว → settle นิ่ง (ไม่วนรอบตัวผู้เล่น)
  if (dist <= cfg.deadZoneTiles) {
    return { tx: state.tx, ty: state.ty, moved: false, teleported: false, dx: 0, dy: 0 };
  }

  // target = จุด trailDistance จากผู้เล่น บนแนวที่ companion อยู่ → lerp เข้าหา, clamp ไม่ให้ overshoot
  const { ux, uy } = unitOrDefault(offX, offY, dist);
  const targetX = playerPos.tx + ux * cfg.trailDistanceTiles;
  const targetY = playerPos.ty + uy * cfg.trailDistanceTiles;
  const moveX = targetX - state.tx;
  const moveY = targetY - state.ty;
  const moveDist = Math.hypot(moveX, moveY);
  if (moveDist < EPS) {
    return { tx: state.tx, ty: state.ty, moved: false, teleported: false, dx: 0, dy: 0 };
  }
  const step = Math.min(moveDist, Math.max(0, cfg.speedTilesPerSec * dtSeconds));
  const nx = state.tx + (moveX / moveDist) * step;
  const ny = state.ty + (moveY / moveDist) * step;
  return {
    tx: nx,
    ty: ny,
    moved: step > EPS,
    teleported: false,
    dx: nx - state.tx,
    dy: ny - state.ty,
  };
}
