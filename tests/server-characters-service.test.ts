import { describe, it, expect } from "vitest";
import { createInMemoryCharacterRepository } from "@/server/characters/memory-repository";
import { createCharacter, listCharacters, getCharacter } from "@/server/characters/service";

const ACCOUNT_A = "11111111-1111-1111-1111-111111111111";
const ACCOUNT_B = "22222222-2222-2222-2222-222222222222";

describe("createCharacter", () => {
  it("creates a character with valid name + classId", async () => {
    const repo = createInMemoryCharacterRepository();
    const r = await createCharacter(repo, {
      accountId: ACCOUNT_A,
      name: "จอมทัพ",
      classId: "swordsman",
      characterSlots: 5,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.character.name).toBe("จอมทัพ");
      expect(r.character.classId).toBe("swordsman");
      expect(r.character.accountId).toBe(ACCOUNT_A);
      expect(r.character.level).toBe(1);
      // owner-report#6 fix: ตัวละครใหม่ยังไม่เคย save ตำแหน่ง → lastMapId null (hub boot DEFAULT_MAP_ID)
      expect(r.character.lastMapId).toBeNull();
    }
    expect(repo.count()).toBe(1);
  });

  it("rejects invalid name and surfaces the underlying nameError code", async () => {
    const repo = createInMemoryCharacterRepository();
    const r = await createCharacter(repo, {
      accountId: ACCOUNT_A,
      name: "ab",
      classId: "swordsman",
      characterSlots: 5,
    });
    expect(r).toEqual({ ok: false, reason: "invalid_name", nameError: "too_short" });
  });

  it("rejects unknown classId", async () => {
    const repo = createInMemoryCharacterRepository();
    const r = await createCharacter(repo, {
      accountId: ACCOUNT_A,
      name: "ValidName",
      classId: "archer", // ยังไม่มี classId นี้ใน CLASS_IDS (§ src/shared/character-class.ts)
      characterSlots: 5,
    });
    expect(r).toEqual({ ok: false, reason: "invalid_class" });
  });

  it("blocks the 6th character when slots = 5 (§3.1/§3.4)", async () => {
    const repo = createInMemoryCharacterRepository();
    for (let i = 0; i < 5; i++) {
      const r = await createCharacter(repo, {
        accountId: ACCOUNT_A,
        name: `Hero${i}`,
        classId: "swordsman",
        characterSlots: 5,
      });
      expect(r.ok).toBe(true);
    }
    const sixth = await createCharacter(repo, {
      accountId: ACCOUNT_A,
      name: "Hero5",
      classId: "swordsman",
      characterSlots: 5,
    });
    expect(sixth).toEqual({ ok: false, reason: "slots_full" });
    expect(repo.count()).toBe(5);
  });

  it("allows duplicate classId across characters (§3.2 duplicateClassAllowed)", async () => {
    const repo = createInMemoryCharacterRepository();
    const r1 = await createCharacter(repo, {
      accountId: ACCOUNT_A,
      name: "First",
      classId: "swordsman",
      characterSlots: 5,
    });
    const r2 = await createCharacter(repo, {
      accountId: ACCOUNT_A,
      name: "Second",
      classId: "swordsman",
      characterSlots: 5,
    });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it("rejects duplicate name case-insensitively, even across accounts (§3.3 uniqueScope: global)", async () => {
    const repo = createInMemoryCharacterRepository();
    await createCharacter(repo, {
      accountId: ACCOUNT_A,
      name: "Jomtap",
      classId: "swordsman",
      characterSlots: 5,
    });
    const dup = await createCharacter(repo, {
      accountId: ACCOUNT_B,
      name: "JOMTAP",
      classId: "swordsman",
      characterSlots: 5,
    });
    expect(dup).toEqual({ ok: false, reason: "name_taken" });
    expect(repo.count()).toBe(1);
  });
});

describe("listCharacters", () => {
  it("lists only characters belonging to the account", async () => {
    const repo = createInMemoryCharacterRepository();
    await createCharacter(repo, { accountId: ACCOUNT_A, name: "AName", classId: "swordsman", characterSlots: 5 });
    await createCharacter(repo, { accountId: ACCOUNT_B, name: "BName", classId: "swordsman", characterSlots: 5 });

    const listA = await listCharacters(repo, ACCOUNT_A);
    expect(listA).toHaveLength(1);
    expect(listA[0].name).toBe("AName");

    const listB = await listCharacters(repo, ACCOUNT_B);
    expect(listB).toHaveLength(1);
    expect(listB[0].name).toBe("BName");
  });

  it("returns empty array when account has no characters", async () => {
    const repo = createInMemoryCharacterRepository();
    expect(await listCharacters(repo, ACCOUNT_A)).toEqual([]);
  });
});

describe("getCharacter", () => {
  it("returns the character when owned by the account", async () => {
    const repo = createInMemoryCharacterRepository();
    const created = await createCharacter(repo, {
      accountId: ACCOUNT_A,
      name: "Owned",
      classId: "swordsman",
      characterSlots: 5,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const found = await getCharacter(repo, ACCOUNT_A, created.character.id);
    expect(found?.name).toBe("Owned");
  });

  it("returns null for cross-account access (guard against IDOR)", async () => {
    const repo = createInMemoryCharacterRepository();
    const created = await createCharacter(repo, {
      accountId: ACCOUNT_A,
      name: "SecretHero",
      classId: "swordsman",
      characterSlots: 5,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const found = await getCharacter(repo, ACCOUNT_B, created.character.id);
    expect(found).toBeNull();
  });

  it("returns null for unknown character id", async () => {
    const repo = createInMemoryCharacterRepository();
    expect(await getCharacter(repo, ACCOUNT_A, "does-not-exist")).toBeNull();
  });
});
