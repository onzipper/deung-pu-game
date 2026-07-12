// Depth-sorted entity registry — pure logic, no PixiJS, no React/Next.
// Plain TS only (invariant engine layer) — generic over display type `D` เพื่อให้
// เทสต์ได้โดยไม่ต้องมี WebGL/pixi (scene.ts จะ instantiate เป็น <Container>).
//
// โซน never-downgrade: depth-sort correctness = โลกทั้งใบพังถ้าผิด. logic การจัดลำดับ +
// dirty tracking อยู่ที่นี่ (source of truth) — pixi แค่เอา order ไป apply (scene.ts).
//
// ── หลักการ (tech §17.2, P0 §4.2) ───────────────────────────────────────────
// • ลำดับวาด = depthKey (iso base = tx+ty, + zLayer band) จาก iso/depth.ts — ไม่คิดสูตรใหม่.
// • Sort เฉพาะเมื่อมี dirty (add/move/remove/setZLayer) — ไม่ sort ทั้ง scene ทุก frame.
// • ลำดับ deterministic เต็ม (total order) → ผลเทสต์ reproducible, ไม่ขึ้นกับ engine sort.

import type { TilePoint } from "@/engine/iso/coords";
import { depthKey } from "@/engine/iso/depth";

/**
 * รายการ 1 entity ใน registry. `key` = depthKey cache ไว้ (คำนวณตอน add/move เท่านั้น
 * ไม่ใช่ทุก frame). `seq` = ลำดับที่ถูก add (monotonic) → tie-break สุดท้ายให้ total order.
 */
export interface DepthEntry<D> {
  readonly id: string;
  readonly display: D;
  tile: TilePoint;
  zLayer: number;
  /** depthKey(tile, zLayer) — cached; recompute เฉพาะตอน tile/zLayer เปลี่ยน */
  key: number;
  /** insertion sequence — deterministic tie-break สุดท้าย (ไม่ mutate หลัง add) */
  readonly seq: number;
}

/**
 * Comparator หัวใจ — total order deterministic:
 *   1) key (depthKey) น้อย → วาดก่อน (อยู่ "บนจอ"/ไกลกว่า)
 *   2) tie-break geometric: tx น้อยก่อน — เมื่อ tx+ty เท่ากัน (แนว iso เดียวกัน)
 *      ตำแหน่งต่างกันแค่ซ้าย/ขวา (sy เท่ากัน ไม่ทับกันจริง) → เลือกลำดับคงที่ด้วย tx
 *   3) tie-break สุดท้าย: seq (insertion order) — กรณี tile+zLayer เท่ากันเป๊ะ
 *      (เช่น player ยืนทับ prop tile เดียวกัน) ให้ผลคงที่ ไม่สั่นระหว่าง frame
 *
 * คืน <0 ถ้า a มาก่อน b, >0 ถ้า b มาก่อน, ไม่มีวันคืน 0 สำหรับ entry คนละตัว
 * (seq ไม่ซ้ำ) → sort เสถียรแน่นอนไม่ว่า engine sort จะ stable หรือไม่.
 */
export function compareDepth<D>(a: DepthEntry<D>, b: DepthEntry<D>): number {
  if (a.key !== b.key) return a.key - b.key;
  if (a.tile.tx !== b.tile.tx) return a.tile.tx - b.tile.tx;
  return a.seq - b.seq;
}

/**
 * Registry ของ display objects ที่ต้อง depth sort (props + entities + debug/player).
 * เก็บ order ไว้ resort เฉพาะเมื่อ dirty. generic `D` = display type (pixi Container ตอน render,
 * แต่ที่นี่ไม่รู้จัก pixi — เทสต์ใช้ marker object ธรรมดาได้).
 */
export class DepthRegistry<D> {
  private readonly entries = new Map<string, DepthEntry<D>>();
  private order: DepthEntry<D>[] = [];
  private dirty = false;
  private nextSeq = 0;

  /** จำนวน entity ปัจจุบัน */
  get size(): number {
    return this.entries.size;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  get(id: string): DepthEntry<D> | undefined {
    return this.entries.get(id);
  }

  /**
   * เพิ่ม entity. ซ้ำ id → throw (fail-loud; caller ต้องจัดการ id ให้ unique).
   * mark dirty เพื่อ resort รอบถัดไป.
   */
  add(id: string, display: D, tile: TilePoint, zLayer = 0): DepthEntry<D> {
    if (this.entries.has(id)) {
      throw new Error(`DepthRegistry.add: id ซ้ำ ("${id}")`);
    }
    const entry: DepthEntry<D> = {
      id,
      display,
      tile: { tx: tile.tx, ty: tile.ty },
      zLayer,
      key: depthKey(tile, zLayer),
      seq: this.nextSeq++,
    };
    this.entries.set(id, entry);
    this.order.push(entry);
    this.dirty = true;
    return entry;
  }

  /**
   * ย้าย entity → ตำแหน่ง tile ใหม่. recompute key + mark dirty **เฉพาะเมื่อค่าคีย์เปลี่ยนจริง**
   * (เดินในแนว iso เดียวกัน tx+ty เท่าเดิม แต่ tx เปลี่ยน → key เท่าเดิมแต่ tie-break tx เปลี่ยน
   *  จึงต้อง dirty ด้วย). id ไม่มี → throw.
   */
  moveEntity(id: string, tile: TilePoint): void {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`DepthRegistry.moveEntity: ไม่พบ id ("${id}")`);
    if (entry.tile.tx === tile.tx && entry.tile.ty === tile.ty) return;
    entry.tile.tx = tile.tx;
    entry.tile.ty = tile.ty;
    entry.key = depthKey(tile, entry.zLayer);
    this.dirty = true;
  }

  /** เปลี่ยน zLayer band → recompute key + dirty. id ไม่มี → throw. */
  setZLayer(id: string, zLayer: number): void {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`DepthRegistry.setZLayer: ไม่พบ id ("${id}")`);
    if (entry.zLayer === zLayer) return;
    entry.zLayer = zLayer;
    entry.key = depthKey(entry.tile, zLayer);
    this.dirty = true;
  }

  /** ลบ entity. คืน entry ที่ลบ (ให้ caller เอา display ไป cleanup) หรือ undefined ถ้าไม่มี. */
  remove(id: string): DepthEntry<D> | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    this.entries.delete(id);
    const idx = this.order.indexOf(entry);
    if (idx >= 0) this.order.splice(idx, 1);
    // ลบไม่ต้อง resort (ลำดับที่เหลือยังถูก) แต่ mark dirty ให้ scene rewire index ก็ได้;
    // ที่นี่ไม่ set dirty เพราะ order ที่เหลือยัง valid — scene ตรวจ order ทุกครั้งที่ dirty เท่านั้น.
    return entry;
  }

  /** true = มีการเปลี่ยนแปลงตั้งแต่ resort ครั้งก่อน (scene ใช้เช็คก่อนเรียก sorted()). */
  isDirty(): boolean {
    return this.dirty;
  }

  /**
   * คืน list เรียงตาม compareDepth. resort เฉพาะเมื่อ dirty (in-place sort ของ order array)
   * แล้วเคลียร์ dirty. ถ้าไม่ dirty คืน order เดิม (O(1)).
   * คืน readonly view — caller ห้าม mutate.
   */
  sorted(): readonly DepthEntry<D>[] {
    if (this.dirty) {
      this.order.sort(compareDepth);
      this.dirty = false;
    }
    return this.order;
  }

  /** ล้างทุก entity (ใช้ตอน destroy scene). */
  clear(): void {
    this.entries.clear();
    this.order = [];
    this.dirty = false;
    this.nextSeq = 0;
  }
}
