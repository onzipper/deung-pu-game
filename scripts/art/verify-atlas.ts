// scripts/art/verify-atlas.ts — validate atlas/manifest ของ asset ด้วย "โค้ด parse ตัวจริงของ engine"
// (ไม่ใช่ schema สำเนา — import จาก src/engine/assets/atlas-format.ts ตรง ๆ จึงตรงกับ runtime เสมอ)
// + จำลอง loop ความครบเฟรมแบบเดียวกับ atlas-loader.ts:94-111 และเช็คเงื่อนไข playerAtlasUsable
// (local-player.ts:51-54: ต้องมี idle/walk/attack) สำหรับ asset ประเภท characters.
//
// ใช้: npx tsx scripts/art/verify-atlas.ts <assetId> [assetsRoot=public/assets]
// exit 0 = ผ่านทุกข้อ (จะโหลดจริง ไม่ตก placeholder) · exit 1 = พังพร้อมเหตุผล

import { readFileSync } from "node:fs";
import {
  anchorFromPivot,
  frameRects,
  parseAtlas,
  parseEntityManifest,
  toAnimationManifest,
} from "../../src/engine/assets/atlas-format";

const assetId = process.argv[2];
if (!assetId) {
  console.error("ใช้: npx tsx scripts/art/verify-atlas.ts <assetId> [assetsRoot]");
  process.exit(1);
}
const root = process.argv[3] ?? "public/assets";

try {
  const manifestJson: unknown = JSON.parse(
    readFileSync(`${root}/manifests/${assetId}.manifest.json`, "utf8"),
  );
  const atlasJson: unknown = JSON.parse(
    readFileSync(`${root}/atlases/${assetId}.atlas.json`, "utf8"),
  );

  const manifest = parseEntityManifest(manifestJson);
  console.log(`parseEntityManifest: OK ${manifest.assetId} [${manifest.drawnDirections.join(",")}]`);

  const atlas = parseAtlas(atlasJson);
  console.log(`parseAtlas: OK ${atlas.width}x${atlas.height}, ${atlas.frames.length} frames, rasterized=${atlas.rasterized}`);
  if (!atlas.rasterized) throw new Error("rasterized=false — loader จะข้าม asset นี้");

  const rects = frameRects(atlas);
  console.log(`frameRects: OK ${rects.size} keys`);

  // mirror ของ atlas-loader.ts:94-111 — ทุก (anim × drawnDirection × frame 0..max) ต้องมี rect และอยู่ในภาพ
  let sliced = 0;
  for (const [animName, def] of Object.entries(manifest.animations)) {
    const texCount = Math.max(...def.frames) + 1;
    for (const dir of manifest.drawnDirections) {
      for (let i = 0; i < texCount; i++) {
        const rect = rects.get(`${animName}:${dir}:${i}`);
        if (!rect) throw new Error(`ขาดเฟรม "${animName}:${dir}:${i}" ใน atlas`);
        if (rect.x + rect.w > atlas.width || rect.y + rect.h > atlas.height) {
          throw new Error(`เฟรม "${animName}:${dir}:${i}" เกินขอบภาพ`);
        }
        sliced++;
      }
    }
  }
  console.log(`loader completeness: OK (${sliced} rects ครบ อยู่ในภาพทั้งหมด)`);

  const anchor = anchorFromPivot(manifest.pivot, manifest.frameSize);
  console.log(`anchorFromPivot: OK ${JSON.stringify(anchor)}`);

  const engineManifest = toAnimationManifest(manifest);
  if (manifest.category === "characters") {
    for (const anim of ["idle", "walk", "attack"]) {
      if (!engineManifest.animations[anim]) {
        throw new Error(`characters ต้องมี anim "${anim}" (เงื่อนไข playerAtlasUsable)`);
      }
    }
    console.log("playerAtlasUsable (idle/walk/attack): OK");
  }

  console.log(`\nALL CHECKS PASSED — ${assetId} จะโหลดจริง ไม่ fallback placeholder`);
} catch (err) {
  console.error(`\nFAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
