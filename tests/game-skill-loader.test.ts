import { describe, expect, test } from "vitest";
import { loadSkillDefinitions, SkillDefinitionError } from "@/game/skill/loader";
import { SKILL_FIELD_NAMES, type SkillDefinition } from "@/game/skill/types";
import { clientView, SERVER_ONLY_FIELDS, serverView } from "@/game/skill/views";
import { WARRIOR_SKILLS_SERVER } from "@/game/skill/data/warrior-skills-server";
import { WARRIOR_SKILLS_CLIENT } from "@/game/skill/data/warrior-skills-client";

// skill definition ที่ถูกต้องขั้นต่ำ (ครบ 37 field) — clone แล้ว mutate เพื่อทดสอบทีละข้อ.
function validSkill(): Record<string, unknown> {
  return {
    skillId: "test_skill",
    skillName: "สกิลทดสอบ",
    class: "swordsman",
    branch: null,
    tier: 0,
    unlockLevel: 1,
    role: "basic single",
    description: "desc",
    targetType: "enemy",
    targetShape: "arc",
    range: 1.2,
    radius: null,
    angle: 60,
    maxTargets: 2,
    hitCount: 1,
    damageType: "physical",
    baseMultiplier: 1.0,
    scalingStat: "ATK",
    cooldown: 0.6,
    castTime: 0.1,
    activeTime: 0,
    recoveryTime: 0.2,
    resourceCost: 0,
    statusEffects: null,
    crowdControl: null,
    bossModifier: 1.0,
    pvpModifier: 1.0,
    comboTags: ["opener"],
    animationCue: "anim",
    vfxCue: "vfx",
    sfxCue: "sfx",
    damageNumberProfile: "standard",
    screenShakeLevel: 0,
    hitStopLevel: 0,
    botUsageRule: "default",
    serverAuthority: true,
    performanceBudget: "low",
  };
}

describe("SKILL_FIELD_NAMES — ยืนยันครบ 37 field ตาม GS v15 §50.1", () => {
  test("นับได้ 37 field ไม่ซ้ำ", () => {
    expect(SKILL_FIELD_NAMES.length).toBe(37);
    expect(new Set(SKILL_FIELD_NAMES).size).toBe(37);
  });

  test("ตรงกับรายชื่อ §50.1 เป๊ะ (ลำดับ+ชื่อ)", () => {
    expect(SKILL_FIELD_NAMES).toEqual([
      "skillId",
      "skillName",
      "class",
      "branch",
      "tier",
      "unlockLevel",
      "role",
      "description",
      "targetType",
      "targetShape",
      "range",
      "radius",
      "angle",
      "maxTargets",
      "hitCount",
      "damageType",
      "baseMultiplier",
      "scalingStat",
      "cooldown",
      "castTime",
      "activeTime",
      "recoveryTime",
      "resourceCost",
      "statusEffects",
      "crowdControl",
      "bossModifier",
      "pvpModifier",
      "comboTags",
      "animationCue",
      "vfxCue",
      "sfxCue",
      "damageNumberProfile",
      "screenShakeLevel",
      "hitStopLevel",
      "botUsageRule",
      "serverAuthority",
      "performanceBudget",
    ]);
  });
});

describe("loadSkillDefinitions — config ดีผ่าน", () => {
  test("skill ขั้นต่ำผ่าน และ field ตรงทุกตัว", () => {
    const map = loadSkillDefinitions([validSkill()]);
    expect(map.size).toBe(1);
    const def = map.get("test_skill");
    expect(def).toBeDefined();
    expect(def).toMatchObject(validSkill());
  });

  test("หลาย skill เข้า map แยก key ตาม skillId", () => {
    const map = loadSkillDefinitions([
      validSkill(),
      { ...validSkill(), skillId: "test_skill_2" },
    ]);
    expect(map.size).toBe(2);
    expect([...map.keys()]).toEqual(["test_skill", "test_skill_2"]);
  });

  test("skillId ซ้ำ → throw", () => {
    expect(() => loadSkillDefinitions([validSkill(), validSkill()])).toThrow(
      SkillDefinitionError,
    );
  });

  test("root ไม่ใช่ array → throw", () => {
    // @ts-expect-error ทดสอบ runtime guard ตอน caller ส่ง type ผิด
    expect(() => loadSkillDefinitions({})).toThrow(SkillDefinitionError);
  });
});

describe("loadSkillDefinitions — field ขาด → throw ระบุชื่อ field", () => {
  for (const field of SKILL_FIELD_NAMES) {
    test(`ขาด ${field} → throw ชื่อ field นั้น`, () => {
      const skill = validSkill();
      delete skill[field];
      expect(() => loadSkillDefinitions([skill])).toThrow(SkillDefinitionError);
      try {
        loadSkillDefinitions([skill]);
        throw new Error("ควร throw ก่อนถึงบรรทัดนี้");
      } catch (err) {
        expect(err).toBeInstanceOf(SkillDefinitionError);
        expect((err as Error).message).toContain(field);
      }
    });
  }
});

describe("loadSkillDefinitions — type ผิด → throw", () => {
  test("skillId เป็น number → throw", () => {
    const skill = { ...validSkill(), skillId: 123 };
    expect(() => loadSkillDefinitions([skill])).toThrow(SkillDefinitionError);
  });

  test("serverAuthority เป็น string → throw", () => {
    const skill = { ...validSkill(), serverAuthority: "true" };
    expect(() => loadSkillDefinitions([skill])).toThrow(SkillDefinitionError);
  });

  test("comboTags ไม่ใช่ array → throw", () => {
    const skill = { ...validSkill(), comboTags: "opener" };
    expect(() => loadSkillDefinitions([skill])).toThrow(SkillDefinitionError);
  });

  test("branch เป็น number (ไม่ใช่ string|null) → throw", () => {
    const skill = { ...validSkill(), branch: 1 };
    expect(() => loadSkillDefinitions([skill])).toThrow(SkillDefinitionError);
  });
});

describe("loadSkillDefinitions — ค่าติดลบที่ไม่ควร → throw", () => {
  test("cooldown ติดลบ → throw", () => {
    const skill = { ...validSkill(), cooldown: -1 };
    expect(() => loadSkillDefinitions([skill])).toThrow(SkillDefinitionError);
  });

  test("range ติดลบ → throw", () => {
    const skill = { ...validSkill(), range: -0.5 };
    expect(() => loadSkillDefinitions([skill])).toThrow(SkillDefinitionError);
  });

  test("maxTargets = 0 → throw (ต้อง ≥ 1)", () => {
    const skill = { ...validSkill(), maxTargets: 0 };
    expect(() => loadSkillDefinitions([skill])).toThrow(SkillDefinitionError);
  });

  test("unlockLevel = 0 → throw (ต้อง ≥ 1)", () => {
    const skill = { ...validSkill(), unlockLevel: 0 };
    expect(() => loadSkillDefinitions([skill])).toThrow(SkillDefinitionError);
  });

  test("baseMultiplier ติดลบ → throw", () => {
    const skill = { ...validSkill(), baseMultiplier: -1 };
    expect(() => loadSkillDefinitions([skill])).toThrow(SkillDefinitionError);
  });
});

describe("loadSkillDefinitions — unknown field (typo/แปลกปลอม) → throw", () => {
  test("field ไม่รู้จัก → throw ระบุชื่อ field", () => {
    const skill = { ...validSkill(), notARealField: 123 };
    expect(() => loadSkillDefinitions([skill])).toThrow(SkillDefinitionError);
    try {
      loadSkillDefinitions([skill]);
      throw new Error("ควร throw ก่อนถึงบรรทัดนี้");
    } catch (err) {
      expect((err as Error).message).toContain("notARealField");
    }
  });

  test("typo field ใกล้เคียงชื่อจริง (baseMultiplyer) → throw", () => {
    const skill = validSkill();
    delete skill.baseMultiplier;
    skill.baseMultiplyer = 1.0;
    expect(() => loadSkillDefinitions([skill])).toThrow(SkillDefinitionError);
  });
});

describe("WARRIOR_SKILLS_SERVER — ข้อมูลจริงนักดาบ 4 skills ผ่าน validation จริง", () => {
  test("ทั้ง 4 skill โหลดผ่าน loader ไม่มี error", () => {
    const map = loadSkillDefinitions(WARRIOR_SKILLS_SERVER as unknown[]);
    expect(map.size).toBe(4);
    expect([...map.keys()]).toEqual([
      "sword_basic_slash",
      "sword_royal_wave",
      "sword_solar_cleave",
      "sword_guard_domain",
    ]);
  });

  test("แต่ละ skill มีครบ 37 field ตรงชื่อ §50.1", () => {
    for (const skill of WARRIOR_SKILLS_SERVER) {
      const keys = Object.keys(skill).sort();
      expect(keys).toEqual([...SKILL_FIELD_NAMES].sort());
    }
  });
});

describe("views — serverView ครบทุก field", () => {
  const def = WARRIOR_SKILLS_SERVER[1]; // sword_royal_wave — AoE farming มีค่าทุก field ที่น่าสนใจ

  test("serverView คืนทุก field (37 ตัว) เท่ากับต้นฉบับ", () => {
    const view = serverView(def);
    expect(Object.keys(view).sort()).toEqual([...SKILL_FIELD_NAMES].sort());
    expect(view).toEqual(def);
  });

  test("serverView คืน copy ใหม่ ไม่ใช่ reference เดิม (กัน mutate ต้นฉบับ)", () => {
    const view = serverView(def);
    expect(view).not.toBe(def);
  });
});

describe("views — clientView ตัด server-only field ออก (TA §16.1)", () => {
  const def: SkillDefinition = WARRIOR_SKILLS_SERVER[1]; // sword_royal_wave
  const view = clientView(def);

  test("SERVER_ONLY_FIELDS ตรงตาม TA §16.1 (9 fields)", () => {
    expect(SERVER_ONLY_FIELDS).toEqual([
      "baseMultiplier",
      "scalingStat",
      "damageType",
      "maxTargets",
      "hitCount",
      "bossModifier",
      "pvpModifier",
      "crowdControl",
      "serverAuthority",
    ]);
  });

  test.each(SERVER_ONLY_FIELDS)("clientView ไม่มี field server-only: %s", (field) => {
    expect(Object.prototype.hasOwnProperty.call(view, field)).toBe(false);
  });

  test("clientView เหลือ 28 field (37 - 9 server-only)", () => {
    expect(Object.keys(view).length).toBe(28);
  });

  test("clientView ยังมี field shared/client-only/bot/meta ครบ (ตัวอย่างสุ่มจากแต่ละกลุ่ม)", () => {
    expect(view).toMatchObject({
      skillId: def.skillId,
      range: def.range,
      cooldown: def.cooldown,
      animationCue: def.animationCue,
      screenShakeLevel: def.screenShakeLevel,
      botUsageRule: def.botUsageRule,
      class: def.class,
      comboTags: def.comboTags,
      performanceBudget: def.performanceBudget,
    });
  });

  test("clientView ทุก skill นักดาบ ไม่มี server-only field หลุด", () => {
    for (const skill of WARRIOR_SKILLS_SERVER) {
      const cv = clientView(skill);
      for (const field of SERVER_ONLY_FIELDS) {
        expect(Object.prototype.hasOwnProperty.call(cv, field)).toBe(false);
      }
    }
  });
});

// ── ป้องกัน balance รั่ว client bundle (P1-05 BLOCKER fix, TA §16.1) ──────────────
// client manifest (warrior-skills-client.ts) ต้อง (ก) ไม่มี server-only key แม้ literal
// (ข) server data ผ่าน loader (ค) สอดคล้อง server (skillId + shared field ตรง = clientView(server)).
describe("WARRIOR_SKILLS_CLIENT — client manifest ปลอด server-only literal + ตรง server (drift guard)", () => {
  test("(ก) ทุก skill ใน client manifest ไม่มี server-only key แม้แต่ literal", () => {
    for (const cv of WARRIOR_SKILLS_CLIENT) {
      const keys = Object.keys(cv);
      for (const field of SERVER_ONLY_FIELDS) {
        expect(keys).not.toContain(field);
      }
      // ยืนยันเหลือ 28 field (37 - 9 server-only) เป๊ะ — ไม่ตกหล่น/ไม่เกิน
      expect(keys.length).toBe(37 - SERVER_ONLY_FIELDS.length);
    }
  });

  test("(ข) server data ผ่าน loader validation จริง (37 field ครบ)", () => {
    const map = loadSkillDefinitions(WARRIOR_SKILLS_SERVER as unknown[]);
    expect(map.size).toBe(WARRIOR_SKILLS_SERVER.length);
  });

  test("(ค) client manifest = clientView(server) เป๊ะ ทุก skill (กัน 2 ไฟล์ drift)", () => {
    // skillId ชุดเดียวกัน ลำดับเดียวกัน
    expect(WARRIOR_SKILLS_CLIENT.map((c) => c.skillId)).toEqual(
      WARRIOR_SKILLS_SERVER.map((s) => s.skillId),
    );
    // ทุก entry: client authored = clientView ของ server ตัวเดียวกัน (shared/client/meta field ค่าตรง)
    for (const server of WARRIOR_SKILLS_SERVER) {
      const client = WARRIOR_SKILLS_CLIENT.find((c) => c.skillId === server.skillId);
      expect(client).toEqual(clientView(server));
    }
  });
});
