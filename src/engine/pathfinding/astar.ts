// A* pathfinding บน logical iso grid — pure math, no PixiJS, no React/Next (invariant engine layer).
// แยก calc ออกจาก render: findPath เป็น pure function (start/goal/walkable predicate → waypoints)
// เทสต์ได้เต็ม ๆ โดยไม่ต้องมี WebGL/DOM — เตรียม P1 server-authoritative (server validate ได้ตัวเดียวกัน).
//
// ── กติกา (P1-09, TA §17.3) ──────────────────────────────────────────────────
// • คิดบน **integer cell** ของ logical grid (พิกัด diamond/logical ไม่ใช่ screen) — walkable ผ่าน callback
//   (isWalkableTile เดิม) เท่านั้น; astar ไม่รู้จัก MapConfig/collision โดยตรง (decoupled).
// • เพื่อนบ้าน 8 ทิศ: ortho (บน/ล่าง/ซ้าย/ขวา, cost 1) + diagonal (เฉียง, cost √2).
// • **กัน corner cutting**: เดินเฉียง (dx,dy) ได้เฉพาะเมื่อ tile ข้างเคียงทั้งสอง (dx,0)+(0,dy) walkable ทั้งคู่
//   → ไม่ให้ตัวมุดผ่านช่องแทยงระหว่างกำแพงสองก้อน (ตาเห็นทะลุมุม = bug).
// • heuristic = octile distance (admissible บน 8-dir grid, cost ortho 1 / diag √2) → ได้ path สั้นสุดจริง.
// • max search nodes cap (config) — map ใหญ่/เป้าหมายเดินไม่ถึงจะได้ไม่ค้าง frame (คืน null เมื่อ expand เกิน cap).
// • คืน waypoints เป็น **integer cell** (ไม่รวม start cell — ผู้เดินอยู่ที่ start แล้ว); path-follower
//   จะเล็งกลาง cell (n+0.5) เอง (convention foot ต่อเนื่อง, ดู path-follower.ts).

import { snapToTile, type TilePoint } from "@/engine/iso/coords";
import type { WalkableFn } from "@/engine/movement/mover";

/** cost เดินเฉียง 1 ก้าว (ortho = 1). */
const DIAG_COST = Math.SQRT2;

/**
 * pack (tx,ty) → integer key เดียวสำหรับ Map lookup O(1). valid เมื่อ 0 ≤ tx < KEY_STRIDE.
 * cell ที่ expand ทุกตัวผ่าน isWalkable แล้ว (นอกขอบ grid = false) → ไม่ติดลบ/ไม่เกิน map จริง.
 * KEY_STRIDE ใหญ่กว่าความกว้าง map ที่เป็นไปได้จริงมาก (map ใหญ่สุดในสเปกยังหลักร้อย tile).
 */
const KEY_STRIDE = 100003;
const keyOf = (tx: number, ty: number): number => ty * KEY_STRIDE + tx;
const txOf = (key: number): number => key % KEY_STRIDE;
const tyOf = (key: number): number => Math.floor(key / KEY_STRIDE);

/** เพื่อนบ้าน 4 ทิศ ortho (dx,dy) — cost 1. */
const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
/** เพื่อนบ้าน 4 ทิศ diagonal (dx,dy) — cost √2, ต้องผ่านเงื่อนไขกัน corner cut. */
const DIAG: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** knob ของ pathfinding (มาจาก EngineConfig.pathfinding — ห้าม hardcode). */
export interface AStarParams {
  /** จำนวน node สูงสุดที่ยอม expand ก่อนยอมแพ้ (คืน null) — กัน frame ค้างบน map ใหญ่/เป้าเดินไม่ถึง. */
  maxSearchNodes: number;
}

/**
 * min-heap แบบง่ายบน array คู่ขนาน (key + f) — open set ของ A*.
 * ไม่ decrease-key: push ซ้ำเมื่อเจอ path ดีกว่า แล้ว skip stale entry ตอน pop ด้วย closed set
 * (pattern มาตรฐาน — กัน allocation ของ node handle ต่อ cell).
 */
class MinHeap {
  private keys: number[] = [];
  private fs: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, f: number): void {
    this.keys.push(key);
    this.fs.push(f);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.fs[parent] <= this.fs[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  /** คืน key ของ node f ต่ำสุด (ต้องเช็ค size > 0 ก่อนเรียก). */
  pop(): number {
    const topKey = this.keys[0];
    const lastKey = this.keys.pop() as number;
    const lastF = this.fs.pop() as number;
    if (this.keys.length > 0) {
      this.keys[0] = lastKey;
      this.fs[0] = lastF;
      this.siftDown();
    }
    return topKey;
  }

  private siftDown(): void {
    const n = this.keys.length;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let smallest = i;
      if (l < n && this.fs[l] < this.fs[smallest]) smallest = l;
      if (r < n && this.fs[r] < this.fs[smallest]) smallest = r;
      if (smallest === i) break;
      this.swap(i, smallest);
      i = smallest;
    }
  }

  private swap(a: number, b: number): void {
    const tk = this.keys[a];
    this.keys[a] = this.keys[b];
    this.keys[b] = tk;
    const tf = this.fs[a];
    this.fs[a] = this.fs[b];
    this.fs[b] = tf;
  }
}

/** octile distance heuristic (admissible บน 8-dir, cost ortho 1 / diag √2). */
function octile(dx: number, dy: number): number {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const min = Math.min(ax, ay);
  const max = Math.max(ax, ay);
  return max - min + DIAG_COST * min;
}

/**
 * หา path จาก start → goal บน integer grid (A*, 8-dir, กัน corner cut, octile heuristic, cap nodes).
 *
 * @param start      ตำแหน่ง foot ต่อเนื่อง (float ได้) — snap เป็น integer cell ภายใน
 * @param goal       เป้าหมาย foot ต่อเนื่อง (float ได้) — snap เป็น integer cell ภายใน
 * @param isWalkable predicate เดินได้ไหม (รับ integer tile; นอกขอบ grid → false)
 * @param params     maxSearchNodes (knob)
 * @returns waypoints เป็น integer cell **ไม่รวม start** เรียงจากก้าวแรก→goal;
 *          `[]` = start/goal cell เดียวกัน (ถึงแล้ว, ไม่ต้องเดิน);
 *          `null` = เดินไม่ถึง / goal block / expand เกิน cap
 */
export function findPath(
  start: TilePoint,
  goal: TilePoint,
  isWalkable: WalkableFn,
  params: AStarParams,
): TilePoint[] | null {
  const s = snapToTile(start);
  const g = snapToTile(goal);

  // goal ต้องเดินได้ (คลิกบนกำแพง/นอกขอบ = ไม่มีเป้าที่ถูกต้อง). start ก็ควรเดินได้ (player อยู่บน walkable).
  if (!isWalkable(g.tx, g.ty)) return null;
  if (!isWalkable(s.tx, s.ty)) return null;
  if (s.tx === g.tx && s.ty === g.ty) return [];

  const startKey = keyOf(s.tx, s.ty);
  const goalKey = keyOf(g.tx, g.ty);

  const gScore = new Map<number, number>([[startKey, 0]]);
  const cameFrom = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap();
  open.push(startKey, octile(g.tx - s.tx, g.ty - s.ty));

  let expanded = 0;

  /** relax เพื่อนบ้าน 1 ตัวจาก current: gScore ใหม่ดีกว่า → อัปเดต cameFrom + push เข้า open. */
  const relax = (
    currentKey: number,
    nx: number,
    ny: number,
    tentativeG: number,
  ): void => {
    const nKey = keyOf(nx, ny);
    if (closed.has(nKey)) return;
    const known = gScore.get(nKey);
    if (known !== undefined && tentativeG >= known) return;
    gScore.set(nKey, tentativeG);
    cameFrom.set(nKey, currentKey);
    open.push(nKey, tentativeG + octile(g.tx - nx, g.ty - ny));
  };

  while (open.size > 0) {
    const currentKey = open.pop();
    if (closed.has(currentKey)) continue; // stale entry (push ซ้ำจาก path ที่ดีกว่า) — ข้าม
    if (currentKey === goalKey) {
      return reconstruct(cameFrom, goalKey, startKey);
    }
    closed.add(currentKey);

    // cap: นับ node ที่ expand จริง — เกินแล้วยอมแพ้ (map ใหญ่/เดินไม่ถึง ไม่ค้าง frame)
    if (++expanded > params.maxSearchNodes) return null;

    const cx = txOf(currentKey);
    const cy = tyOf(currentKey);
    const baseG = gScore.get(currentKey) as number;

    // ── ortho neighbors (cost 1) ──
    for (let i = 0; i < ORTHO.length; i++) {
      const nx = cx + ORTHO[i][0];
      const ny = cy + ORTHO[i][1];
      if (!isWalkable(nx, ny)) continue;
      relax(currentKey, nx, ny, baseG + 1);
    }

    // ── diagonal neighbors (cost √2, กัน corner cutting) ──
    for (let i = 0; i < DIAG.length; i++) {
      const dx = DIAG[i][0];
      const dy = DIAG[i][1];
      const nx = cx + dx;
      const ny = cy + dy;
      if (!isWalkable(nx, ny)) continue;
      // เดินเฉียงได้เฉพาะเมื่อ tile ข้าง ๆ ทั้งสอง walkable → ไม่มุดผ่านมุมกำแพง
      if (!isWalkable(cx + dx, cy) || !isWalkable(cx, cy + dy)) continue;
      relax(currentKey, nx, ny, baseG + DIAG_COST);
    }
  }

  return null; // open หมด = เดินไม่ถึง
}

/** reconstruct path จาก cameFrom (goal→start) แล้ว reverse → [ก้าวแรก..goal] (ไม่รวม start). */
function reconstruct(
  cameFrom: Map<number, number>,
  goalKey: number,
  startKey: number,
): TilePoint[] {
  const out: TilePoint[] = [];
  let cur = goalKey;
  while (cur !== startKey) {
    out.push({ tx: txOf(cur), ty: tyOf(cur) });
    const prev = cameFrom.get(cur);
    if (prev === undefined) break; // ไม่ควรเกิด (path ต่อเนื่อง) — กันเหนียว
    cur = prev;
  }
  out.reverse();
  return out;
}
