// Mob animation manifest — data-driven, reuse engine animation infra ผ่าน public API
// (resolveClip/advancePlayhead/AnimationManifest ใน @/engine/animation/manifest — ไม่คิดสูตรใหม่).
//
// ── ทำไม 2 ทิศ (S, N) + mirror แทน 5-dir+mirror ของ player ─────────────────────
// Mob dummy (slime ก้อนกลม / เห็ดหมวก, ดู game/mob/placeholder.ts) ไม่มี asymmetry ซ้าย-ขวา
// ที่มองเห็นได้ (ต่างจาก player ที่จงใจมี accent ข้างเดียว) → วาดจริงพอ 2 ทิศ (S, N; ต่างกันแค่
// pose บอบบาง) แล้ว mirror อีก 6 ทิศไปหาทิศใกล้เคียง — ผล visual จะดูเหมือนกันไม่ว่าจะ mirror
// หรือไม่ (ตัวกลม/สมมาตร) แต่ยัง reuse ระบบ resolveClip/animator เดิมได้เต็มและทิศยังถูก
// คำนวณ+ส่งเข้า animation จริงจาก wander (เผื่อ P1 ใส่ art ไม่สมมาตรทีหลังไม่ต้องรื้อ pipeline).
// ทางเลือกอื่นที่พิจารณาแล้วไม่เลือก: 8-dir isotropic (ครบ 8 ทิศ, mirror ว่าง) — ถูกต้องเหมือนกัน
// แต่ generate texture ซ้ำ 4 เท่าโดยเปล่าประโยชน์ (ภาพเหมือนกันทุกทิศอยู่แล้ว).

import type { Direction } from "@/engine/movement/direction";
import type { AnimationManifest } from "@/engine/animation/manifest";
import type { MobAnimationConfig } from "@/engine/config";

/** ทิศที่ mob วาดจริง — 2 ทิศพอ (ดูเหตุผลบนหัวไฟล์). */
export const MOB_DRAWN_DIRECTIONS: readonly Direction[] = ["S", "N"];

/** ทิศที่เหลือ mirror ไปทิศใกล้เคียงที่วาดจริง (เลือกฝั่งไหนไม่กระทบภาพ — symmetric). */
export const MOB_MIRROR_MAP: Readonly<Partial<Record<Direction, Direction>>> = {
  SW: "S",
  SE: "S",
  W: "S",
  E: "N",
  NW: "N",
  NE: "N",
};

/** ชื่อ animation ที่ mob รองรับใน P0-09 — attack ยังไม่มี (P0-10 combat stub จะเพิ่ม). */
export type MobAnimationName = "idle" | "walk";

/** [0,1,...,n−1] — ลำดับเฟรมวิ่งตรง n เฟรม (เหมือน manifest.ts ของ player). */
function seq(n: number): number[] {
  return Array.from({ length: Math.max(1, n) }, (_, i) => i);
}

/**
 * ประกอบ manifest ของ mob จาก config knob (data-driven, MobAnimationConfig — src/engine/config.ts).
 * idle/walk วนลูป — ไม่มี attack ใน P0-09.
 */
export function createMobAnimationManifest(
  config: MobAnimationConfig,
): AnimationManifest {
  return {
    drawnDirections: MOB_DRAWN_DIRECTIONS,
    mirrorMap: MOB_MIRROR_MAP,
    animations: {
      idle: {
        frames: seq(config.idleFrames),
        frameDuration: config.idleFrameDuration,
        loop: true,
      },
      walk: {
        frames: seq(config.walkFrames),
        frameDuration: config.walkFrameDuration,
        loop: true,
      },
    },
  };
}
