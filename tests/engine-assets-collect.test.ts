import { describe, expect, test } from "vitest";
import { collectMapAssetIds } from "@/engine/assets/collect";
import { DEFAULT_ENGINE_CONFIG, type EngineConfig } from "@/engine/config";
import type { MapConfig } from "@/engine/map/types";

// config ที่ style ต่าง ๆ ถูกฉีด assetId (tolerant read — config types จริงยังไม่มี field นี้ → cast).
const CONFIG = {
  player: { animation: { style: { assetId: "char_hero" } } },
  mob: {
    styles: {
      slime: { assetId: "mon_slime_leaf" },
      mushroom: {}, // ไม่มี assetId → ต้องถูกกรองทิ้ง
    },
    defaultStyle: { assetId: "mon_default" },
  },
  theme: {
    props: {
      tree: { assetId: "prop_tree" },
      rock: {}, // ไม่มี assetId → กรองทิ้ง
    },
    defaultProp: { assetId: "prop_default" },
  },
} as unknown as EngineConfig;

const mapWith = (mobTypes: string[]): MapConfig =>
  ({
    mobPockets: mobTypes.map((mobType, i) => ({ pocketId: `p${i}`, mobType })),
    props: [],
  }) as unknown as MapConfig;

describe("collectMapAssetIds", () => {
  test("รวม player + mob(pocket) + prop(theme), กรอง undefined, dedupe คงลำดับ", () => {
    const map = mapWith(["slime", "mushroom", "unknownmob", "slime"]);
    const ids = collectMapAssetIds(map, CONFIG);
    // player, slime, (mushroom ข้าม), unknownmob→defaultStyle, (slime ซ้ำ dedupe), tree, (rock ข้าม), defaultProp
    expect(ids).toEqual([
      "char_hero",
      "mon_slime_leaf",
      "mon_default",
      "prop_tree",
      "prop_default",
    ]);
  });

  test("ไม่มี pocket → เก็บแค่ player + prop styles ของ theme", () => {
    const ids = collectMapAssetIds(mapWith([]), CONFIG);
    expect(ids).toEqual(["char_hero", "prop_tree", "prop_default"]);
  });

  test("style ไม่มี assetId เลย (DEFAULT config) → คืน array ว่าง", () => {
    const map = mapWith(["slime", "mushroom"]);
    expect(collectMapAssetIds(map, DEFAULT_ENGINE_CONFIG)).toEqual([]);
  });

  test("dedupe ข้าม category (player = mob assetId เดียวกัน → ครั้งเดียว)", () => {
    const config = {
      ...CONFIG,
      player: { animation: { style: { assetId: "shared" } } },
      mob: { styles: { slime: { assetId: "shared" } }, defaultStyle: {} },
      theme: { props: {}, defaultProp: {} },
    } as unknown as EngineConfig;
    expect(collectMapAssetIds(mapWith(["slime"]), config)).toEqual(["shared"]);
  });
});
