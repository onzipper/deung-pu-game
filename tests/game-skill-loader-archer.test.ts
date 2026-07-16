import { describe, expect, test } from "vitest";
import { loadSkillDefinitions } from "@/game/skill/loader";
import { SKILL_FIELD_NAMES } from "@/game/skill/types";
import { clientView, SERVER_ONLY_FIELDS } from "@/game/skill/views";
import { ARCHER_SKILLS_SERVER } from "@/game/skill/data/archer-skills-server";
import { ARCHER_SKILLS_CLIENT } from "@/game/skill/data/archer-skills-client";

// นักธนู (Batch 6) — mirror pattern ของ WARRIOR_SKILLS_* ใน game-skill-loader.test.ts:
//   server data ผ่าน loader จริง (37 field §50.1) + client manifest = clientView(server) เป๊ะ (drift guard).

describe("ARCHER_SKILLS_SERVER — ข้อมูลจริงนักธนู 4 skills ผ่าน validation จริง", () => {
  test("ทั้ง 4 skill โหลดผ่าน loader ไม่มี error (ลำดับ skillId ตรง §3 S1–S4)", () => {
    const map = loadSkillDefinitions(ARCHER_SKILLS_SERVER as unknown[]);
    expect(map.size).toBe(4);
    expect([...map.keys()]).toEqual([
      "archer_basic_shot",
      "archer_moon_rain",
      "archer_target_mark",
      "archer_swift_step",
    ]);
  });

  test("แต่ละ skill มีครบ 37 field ตรงชื่อ §50.1", () => {
    for (const skill of ARCHER_SKILLS_SERVER) {
      const keys = Object.keys(skill).sort();
      expect(keys).toEqual([...SKILL_FIELD_NAMES].sort());
    }
  });

  test("ทุก skill classId = archer", () => {
    for (const skill of ARCHER_SKILLS_SERVER) expect(skill.class).toBe("archer");
  });

  test("archer_swift_step: self-displacement (maxTargets 0 / hitCount 0 / no damage) โหลดผ่าน", () => {
    const swift = ARCHER_SKILLS_SERVER.find((s) => s.skillId === "archer_swift_step");
    expect(swift).toBeDefined();
    expect(swift!.maxTargets).toBe(0);
    expect(swift!.hitCount).toBe(0);
    expect(swift!.baseMultiplier).toBe(0);
  });
});

describe("ARCHER_SKILLS_CLIENT — client manifest ปลอด server-only literal + ตรง server (drift guard)", () => {
  test("(ก) ทุก skill ใน client manifest ไม่มี server-only key แม้แต่ literal + เหลือ 28 field เป๊ะ", () => {
    for (const cv of ARCHER_SKILLS_CLIENT) {
      const keys = Object.keys(cv);
      for (const field of SERVER_ONLY_FIELDS) expect(keys).not.toContain(field);
      expect(keys.length).toBe(37 - SERVER_ONLY_FIELDS.length);
    }
  });

  test("(ข) server data ผ่าน loader validation จริง (37 field ครบ)", () => {
    const map = loadSkillDefinitions(ARCHER_SKILLS_SERVER as unknown[]);
    expect(map.size).toBe(ARCHER_SKILLS_SERVER.length);
  });

  test("(ค) client manifest = clientView(server) เป๊ะ ทุก skill (กัน 2 ไฟล์ drift)", () => {
    expect(ARCHER_SKILLS_CLIENT.map((c) => c.skillId)).toEqual(
      ARCHER_SKILLS_SERVER.map((s) => s.skillId),
    );
    for (const server of ARCHER_SKILLS_SERVER) {
      const client = ARCHER_SKILLS_CLIENT.find((c) => c.skillId === server.skillId);
      expect(client).toEqual(clientView(server));
    }
  });
});
