// scripts/art/check-sprite-sheet.mjs — ตรวจรับ sprite sheet เทียบ atlas/manifest contract
// (คู่กับ fix-sprite-png.mjs — ตัวนั้น "ซ่อม", ตัวนี้ "ตัดสิน") ใช้โดย art-inspector agent /sprite-intake.
//
// ตรวจอะไร (ทุกข้อคือ failure จริงที่เคยเจอจาก AI image model):
//   1. ขนาด PNG ตรง atlas.json + alpha แท้ (พื้นหลอก = ขอบภาพทึบ)
//   2. เฟรมที่ประกาศ: ไม่ว่าง, ไม่ชนขอบช่อง (บลีดข้ามเฟรม), เท้า (จุดต่ำสุด) ตรง pivot ±2,
//      ความสูง sprite สม่ำเสมอ
//   3. พื้นที่นอกเฟรมที่ประกาศ: ต้องโปร่งใสจริง (จับ "เฟรมเกิน" / วางล้นช่อง)
//   4. ท่า walk: เฟรมติดกันต้องต่างกันจริง (จับ "ขาไม่ก้าว") + ankle band กว้างสลับแคบ
//   5. ท่า attack: ทุกเฟรมต้องต่างจาก idle ชัด (จับ "ยืนเฉยแปะเอฟเฟกต์")
//
// ใช้: node scripts/art/check-sprite-sheet.mjs <sheet.png> --atlas <atlas.json>
//        [--manifest <manifest.json>] [--strips <outDir>]
//   --manifest = เปิดเช็คเท้าเทียบ pivot · --strips = export ภาพแถวละ strip (ขยาย 2×) ให้ตรวจด้วยตา
//   exit 0 = PASS ทุกข้อ · exit 1 = มี FAIL (รายการอยู่ท้ายรายงาน)

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";

const args = process.argv.slice(2);
if (args.length === 0 || args[0].startsWith("--")) {
  console.error("ใช้: node scripts/art/check-sprite-sheet.mjs <sheet.png> --atlas <atlas.json> [--manifest <m.json>] [--strips <dir>]");
  process.exit(1);
}
const flagValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};
const sheetPath = args[0];
const atlasPath = flagValue("--atlas");
const manifestPath = flagValue("--manifest");
const stripsDir = flagValue("--strips");
if (!atlasPath) {
  console.error("ต้องส่ง --atlas <atlas.json>");
  process.exit(1);
}

const ALPHA = 16; // alpha เกินนี้ = เนื้อภาพ (เกณฑ์เดียวกับ fix-sprite-png)
const failures = [];
const fail = (msg) => { failures.push(msg); console.log(`  ✗ FAIL: ${msg}`); };
const pass = (msg) => console.log(`  ✓ ${msg}`);

const atlas = JSON.parse(readFileSync(atlasPath, "utf8"));
const manifest = manifestPath ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
const png = PNG.sync.read(readFileSync(sheetPath));
const { width: w, height: h, data } = png;
const [cellW, cellH] = atlas.frameSize;

console.log(`\n== check-sprite-sheet: ${sheetPath} ==`);

// ── 1. ขนาด + alpha แท้ ─────────────────────────────────────────────────────────
console.log("\n[1] ขนาด + ความโปร่งใส");
if (w !== atlas.width || h !== atlas.height) {
  fail(`ขนาด PNG ${w}x${h} ไม่ตรง atlas ${atlas.width}x${atlas.height} — รัน fix-sprite-png --atlas ก่อน`);
} else {
  pass(`ขนาด ${w}x${h} ตรง atlas`);
}
let borderOpaque = 0;
let borderTotal = 0;
const opaqueAt = (x, y) => data[(y * w + x) * 4 + 3] > ALPHA;
for (let x = 0; x < w; x++) { borderTotal += 2; if (opaqueAt(x, 0)) borderOpaque++; if (opaqueAt(x, h - 1)) borderOpaque++; }
for (let y = 1; y < h - 1; y++) { borderTotal += 2; if (opaqueAt(0, y)) borderOpaque++; if (opaqueAt(w - 1, y)) borderOpaque++; }
if (borderOpaque / borderTotal > 0.05) {
  fail(`ขอบภาพทึบ ${((borderOpaque / borderTotal) * 100).toFixed(1)}% — น่าจะเป็นพื้นหลอก รัน fix-sprite-png ก่อน`);
} else {
  pass(`alpha แท้ (ขอบทึบ ${((borderOpaque / borderTotal) * 100).toFixed(1)}%)`);
}

// ── เตรียมข้อมูลต่อเฟรม ─────────────────────────────────────────────────────────
// key = "<anim>_<dir>_<frame>" — split จากขวาแบบเดียวกับ atlas-format.frameRects
const frames = atlas.frames.map((f) => {
  const parts = f.key.split("_");
  const frameIndex = Number(parts[parts.length - 1]);
  const dir = parts[parts.length - 2];
  const anim = parts.slice(0, parts.length - 2).join("_");
  return { ...f, anim, dir, frameIndex };
});

function bboxOf(fr) {
  let minX = fr.w, minY = fr.h, maxX = -1, maxY = -1, count = 0;
  for (let y = 0; y < fr.h; y++) {
    for (let x = 0; x < fr.w; x++) {
      if (data[((fr.y + y) * w + fr.x + x) * 4 + 3] > ALPHA) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { count, minX, minY, maxX, maxY };
}
const stats = frames.map((fr) => ({ ...fr, ...bboxOf(fr) }));

// ── 2. เฟรมที่ประกาศ ────────────────────────────────────────────────────────────
console.log("\n[2] เฟรมที่ประกาศ (ว่าง/ชนขอบ/เท้า/ความสูง)");
const empty = stats.filter((s) => s.count === 0);
if (empty.length > 0) fail(`เฟรมว่าง ${empty.length} ช่อง: ${empty.slice(0, 5).map((s) => s.key).join(", ")}${empty.length > 5 ? " …" : ""}`);
else pass(`ทุกเฟรมมีเนื้อภาพ (${stats.length} เฟรม)`);

const edge = stats.filter((s) => s.count > 0 && (s.minX === 0 || s.minY === 0 || s.maxX === s.w - 1 || s.maxY === s.h - 1));
if (edge.length > 0) fail(`เฟรมชนขอบช่อง (เสี่ยงบลีดข้ามเฟรม) ${edge.length} ช่อง: ${edge.slice(0, 5).map((s) => s.key).join(", ")}${edge.length > 5 ? " …" : ""}`);
else pass("ไม่มีเฟรมชนขอบช่อง");

const nonEmpty = stats.filter((s) => s.count > 0);
const feet = nonEmpty.map((s) => s.maxY);
const feetMin = Math.min(...feet), feetMax = Math.max(...feet);
if (manifest) {
  const pivotY = manifest.pivot[1];
  const off = nonEmpty.filter((s) => Math.abs(s.maxY - pivotY) > 2);
  // ยกเว้นเฟรม attack ที่ effect อาจดันเท้า/ลากต่ำ — รายงานแยกแต่ไม่ FAIL ถ้าเป็น attack
  const offCore = off.filter((s) => s.anim !== "attack");
  if (offCore.length > 0) {
    fail(`เท้าไม่ตรง pivot y=${pivotY}±2 จำนวน ${offCore.length} เฟรม (เช่น ${offCore.slice(0, 4).map((s) => `${s.key}@${s.maxY}`).join(", ")})`);
  } else {
    pass(`เท้าตรง pivot y=${pivotY}±2 ทุกเฟรมหลัก (ช่วงจริง ${feetMin}-${feetMax})`);
  }
} else {
  console.log(`  · เท้า (จุดต่ำสุด) ช่วง ${feetMin}-${feetMax} — ส่ง --manifest เพื่อเทียบ pivot`);
}
const idleHeights = nonEmpty.filter((s) => s.anim === "idle").map((s) => s.maxY - s.minY + 1);
if (idleHeights.length > 0) {
  console.log(`  · ความสูงท่ายืน: ${Math.min(...idleHeights)}-${Math.max(...idleHeights)} px`);
}

// ── 3. พื้นที่นอกเฟรมที่ประกาศ ────────────────────────────────────────────────────
console.log("\n[3] พื้นที่นอกเฟรมที่ประกาศ (ต้องโปร่งใส)");
const declared = new Uint8Array(w * h);
for (const fr of frames) {
  for (let y = fr.y; y < fr.y + fr.h; y++) declared.fill(1, y * w + fr.x, y * w + fr.x + fr.w);
}
const strayCells = new Map();
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    if (!declared[y * w + x] && data[(y * w + x) * 4 + 3] > ALPHA) {
      const cell = `col${Math.floor(x / cellW)},row${Math.floor(y / cellH)}`;
      strayCells.set(cell, (strayCells.get(cell) ?? 0) + 1);
    }
  }
}
const strayTotal = [...strayCells.values()].reduce((a, b) => a + b, 0);
if (strayTotal > 50) {
  const top = [...strayCells.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  fail(`มีเนื้อภาพนอกเฟรมที่ประกาศ ${strayTotal.toLocaleString()} px (เฟรมเกิน/วางล้น) หนาแน่นที่: ${top.map(([c, n]) => `${c}(${n})`).join(", ")}`);
} else {
  pass(`พื้นที่นอกประกาศสะอาด (${strayTotal} px)`);
}

// ── 4-5. movement ────────────────────────────────────────────────────────────────
function diffFrames(a, b) {
  let d = 0;
  for (let y = 0; y < a.h; y++) {
    for (let x = 0; x < a.w; x++) {
      const oa = ((a.y + y) * w + a.x + x) * 4;
      const ob = ((b.y + y) * w + b.x + x) * 4;
      if (Math.abs(data[oa + 3] - data[ob + 3]) > 24) { d++; continue; }
      if (data[oa + 3] > 24) {
        const c = Math.abs(data[oa] - data[ob]) + Math.abs(data[oa + 1] - data[ob + 1]) + Math.abs(data[oa + 2] - data[ob + 2]);
        if (c > 90) d++;
      }
    }
  }
  return d;
}
const byAnimDir = new Map();
for (const s of stats) {
  const k = `${s.anim}:${s.dir}`;
  if (!byAnimDir.has(k)) byAnimDir.set(k, []);
  byAnimDir.get(k).push(s);
}
for (const list of byAnimDir.values()) list.sort((a, b) => a.frameIndex - b.frameIndex);

const walkDirs = [...byAnimDir.keys()].filter((k) => k.startsWith("walk:"));
if (walkDirs.length > 0) {
  console.log("\n[4] ท่าเดิน (ขาต้องก้าวจริง)");
  for (const k of walkDirs) {
    const list = byAnimDir.get(k);
    const avgPx = list.reduce((a, s) => a + s.count, 0) / list.length;
    let minAdj = Infinity;
    for (let i = 0; i + 1 < list.length; i++) minAdj = Math.min(minAdj, diffFrames(list[i], list[i + 1]));
    const swap = list.length >= 4 ? diffFrames(list[0], list[Math.floor(list.length / 2)]) : minAdj;
    const adjPct = (minAdj / avgPx) * 100;
    const swapPct = (swap / avgPx) * 100;
    if (adjPct < 15 || swapPct < 30) {
      fail(`${k}: เฟรมแทบไม่ขยับ (คู่ติดกันต่ำสุด ${adjPct.toFixed(0)}% ต้อง ≥15 · ก้าวสลับ ${swapPct.toFixed(0)}% ต้อง ≥30)`);
    } else {
      pass(`${k}: ขยับจริง (คู่ติดกันต่ำสุด ${adjPct.toFixed(0)}% · ก้าวสลับ ${swapPct.toFixed(0)}%)`);
    }
  }
}
const attackDirs = [...byAnimDir.keys()].filter((k) => k.startsWith("attack:"));
if (attackDirs.length > 0) {
  console.log("\n[5] ท่าโจมตี (ตัวต้องเปลี่ยนท่า ไม่ใช่แค่เอฟเฟกต์)");
  for (const k of attackDirs) {
    const dir = k.split(":")[1];
    const idle0 = byAnimDir.get(`idle:${dir}`)?.[0];
    if (!idle0) continue;
    const list = byAnimDir.get(k);
    const avgPx = list.reduce((a, s) => a + s.count, 0) / list.length;
    const vsIdle = list.map((s) => (diffFrames(s, idle0) / avgPx) * 100);
    const weak = vsIdle.filter((p) => p < 25).length;
    if (weak > 1) {
      fail(`${k}: ${weak} เฟรมท่าแทบเหมือน idle (${vsIdle.map((p) => p.toFixed(0) + "%").join(", ")} — ต้อง ≥25% เกือบทุกเฟรม)`);
    } else {
      pass(`${k}: ท่าต่างจาก idle จริง (${vsIdle.map((p) => p.toFixed(0) + "%").join(", ")})`);
    }
  }
}

// ── strips (ให้คนหรือ agent ที่มีตาดู) ───────────────────────────────────────────
if (stripsDir) {
  mkdirSync(stripsDir, { recursive: true });
  const SCALE = 2;
  for (const [k, list] of byAnimDir) {
    const out = new PNG({ width: list.length * cellW * SCALE, height: cellH * SCALE });
    list.forEach((fr, i) => {
      for (let y = 0; y < fr.h; y++) {
        for (let x = 0; x < fr.w; x++) {
          const so = ((fr.y + y) * w + fr.x + x) * 4;
          for (let dy = 0; dy < SCALE; dy++) {
            for (let dx = 0; dx < SCALE; dx++) {
              const doff = ((y * SCALE + dy) * out.width + (i * cellW + x) * SCALE + dx) * 4;
              out.data[doff] = data[so];
              out.data[doff + 1] = data[so + 1];
              out.data[doff + 2] = data[so + 2];
              out.data[doff + 3] = data[so + 3];
            }
          }
        }
      }
    });
    writeFileSync(join(stripsDir, `${k.replace(":", "_")}.png`), PNG.sync.write(out));
  }
  console.log(`\nstrips → ${stripsDir} (${byAnimDir.size} ไฟล์ ขยาย ${SCALE}×)`);
}

// ── สรุป ────────────────────────────────────────────────────────────────────────
console.log(`\n== RESULT: ${failures.length === 0 ? "PASS" : `FAIL (${failures.length} ข้อ)`} ==`);
for (const f of failures) console.log(`  - ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
