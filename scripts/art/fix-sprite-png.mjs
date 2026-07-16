// scripts/art/fix-sprite-png.mjs — ซ่อม sprite sheet PNG จาก AI image model ให้ตรง contract ของ engine
// (docs/context/engine.md atlas pipeline). ปัญหาที่ซ่อม:
//   1. "พื้นหลังหลอก" — image model วาดลายหมากรุก/พื้นสว่างเป็น pixel จริงแทน alpha โปร่งใส
//      → ตรวจจับจากขอบภาพ แล้ว flood-fill ลอกออก (ตัวละครมีเส้นขอบเข้มล้อม ไม่โดนกิน)
//   2. ขนาดภาพไม่ตรง atlas.json — model ชอบส่งขนาดตามใจ (เช่น 656×1632 แทน 576×1440)
//      → resize แยกแกนด้วย bilinear + premultiplied alpha (กันขอบตัวละครเป็นเงาขาว)
//
// ใช้: node scripts/art/fix-sprite-png.mjs <sheet.png> [--atlas <atlas.json>] [--in-place] [--tolerance 36]
//   default เขียนผลไป <ชื่อ>.fixed.png · --in-place = ทับไฟล์เดิม (สำรองของเดิมไว้ที่ <ชื่อ>.bak ก่อน)
//   ไฟล์ที่ alpha ดีอยู่แล้ว → ข้ามขั้นลอกพื้นอัตโนมัติ (no-op ปลอดภัย รันซ้ำได้)
//
// plain .mjs + pngjs เท่านั้น (pattern เดียวกับ scripts/e2e/*.mjs — ไม่แตะ src/**)

import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

// ── args ────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.length === 0 || args[0].startsWith("--")) {
  console.error("ใช้: node scripts/art/fix-sprite-png.mjs <sheet.png> [--atlas <atlas.json>] [--in-place] [--tolerance N]");
  process.exit(1);
}
const inputPath = args[0];
const flag = (name) => args.includes(name);
const flagValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};
const atlasPath = flagValue("--atlas");
const inPlace = flag("--in-place");
const tolerance = Number(flagValue("--tolerance") ?? 36);
const haloTolerance = tolerance * 3; // ขอบเบลอจาก anti-alias เพี้ยนจากสีพื้นได้มากกว่า pixel พื้นแท้

const ALPHA_OPAQUE = 16; // alpha เกินนี้ = นับเป็นเนื้อภาพ (เกณฑ์เดียวกับที่ใช้ตรวจรับทุกรอบ)

const png = PNG.sync.read(readFileSync(inputPath));
let { width: w, height: h, data } = png;
console.log(`อ่าน ${inputPath} — ${w}x${h}`);

// ── ขั้น 1: ตรวจว่าพื้นหลังหลอกไหม (ขอบภาพควรโปร่งใสทั้งหมดถ้า alpha แท้) ─────────────
const idx = (x, y) => (y * w + x) * 4;
let borderTotal = 0;
let borderOpaque = 0;
const borderColorCount = new Map();
const sampleBorder = (x, y) => {
  borderTotal++;
  const o = idx(x, y);
  if (data[o + 3] <= ALPHA_OPAQUE) return;
  borderOpaque++;
  const key = (data[o] << 16) | (data[o + 1] << 8) | data[o + 2];
  borderColorCount.set(key, (borderColorCount.get(key) ?? 0) + 1);
};
for (let x = 0; x < w; x++) { sampleBorder(x, 0); sampleBorder(x, h - 1); }
for (let y = 1; y < h - 1; y++) { sampleBorder(0, y); sampleBorder(w - 1, y); }

const fakeBg = borderOpaque / borderTotal > 0.5;
let clearedCount = 0;

if (!fakeBg) {
  console.log(`ขอบภาพโปร่งใส ${(100 - (borderOpaque / borderTotal) * 100).toFixed(1)}% → alpha แท้อยู่แล้ว ข้ามขั้นลอกพื้น`);
} else {
  // 2 สีที่พบมากสุดบนขอบ = สีพื้นหลอก (ลายหมากรุกมี 2 สี / พื้นเรียบมี 1 — ตัวที่สองจะถูกใช้น้อยเอง)
  const ranked = [...borderColorCount.entries()].sort((a, b) => b[1] - a[1]);
  const bg = ranked.slice(0, 2).map(([key]) => [(key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff]);
  console.log(
    `ขอบภาพทึบ ${((borderOpaque / borderTotal) * 100).toFixed(1)}% → พื้นหลอก สีพื้น: ` +
      bg.map(([r, g, b]) => `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0").toUpperCase()}`).join(" / "),
  );

  const matchesBg = (o, tol) => {
    const r = data[o], g = data[o + 1], b = data[o + 2];
    return bg.some(([br, bgc, bb]) => Math.abs(r - br) + Math.abs(g - bgc) + Math.abs(b - bb) <= tol);
  };

  // ── ขั้น 2: flood-fill จากขอบ (BFS 4 ทิศ) เคลียร์เฉพาะพื้นที่สีพื้น "ต่อเนื่องจากขอบ" ──
  // ห้ามกวาดทั้งภาพตรงๆ — สีใกล้พื้น (ดาบเงิน/ไฮไลท์ขาว) ที่อยู่ "ใน" ตัวละครต้องรอด
  const cleared = new Uint8Array(w * h);
  const queue = [];
  for (let x = 0; x < w; x++) {
    if (matchesBg(idx(x, 0), tolerance)) queue.push(x);
    if (matchesBg(idx(x, h - 1), tolerance)) queue.push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    if (matchesBg(idx(0, y), tolerance)) queue.push(y * w);
    if (matchesBg(idx(w - 1, y), tolerance)) queue.push(y * w + w - 1);
  }
  while (queue.length > 0) {
    const p = queue.pop();
    if (cleared[p]) continue;
    cleared[p] = 1;
    const x = p % w;
    const y = (p - x) / w;
    if (x + 1 < w && !cleared[p + 1] && matchesBg(idx(x + 1, y), tolerance)) queue.push(p + 1);
    if (x - 1 >= 0 && !cleared[p - 1] && matchesBg(idx(x - 1, y), tolerance)) queue.push(p - 1);
    if (y + 1 < h && !cleared[p + w] && matchesBg(idx(x, y + 1), tolerance)) queue.push(p + w);
    if (y - 1 >= 0 && !cleared[p - w] && matchesBg(idx(x, y - 1), tolerance)) queue.push(p - w);
  }

  // halo pass ×2: pixel ติดพื้นที่เคลียร์แล้ว + สีเพี้ยนจากพื้นไม่มาก (ขอบ anti-alias) → เก็บด้วย
  for (let pass = 0; pass < 2; pass++) {
    const extra = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (cleared[p]) continue;
        const nearCleared =
          (x + 1 < w && cleared[p + 1]) || (x - 1 >= 0 && cleared[p - 1]) ||
          (y + 1 < h && cleared[p + w]) || (y - 1 >= 0 && cleared[p - w]);
        if (nearCleared && matchesBg(idx(x, y), haloTolerance)) extra.push(p);
      }
    }
    if (extra.length === 0) break;
    for (const p of extra) cleared[p] = 1;
  }

  for (let p = 0; p < w * h; p++) {
    if (cleared[p]) { data[p * 4 + 3] = 0; clearedCount++; }
  }
  console.log(`ลอกพื้น ${clearedCount.toLocaleString()} px (${((clearedCount / (w * h)) * 100).toFixed(1)}% ของภาพ)`);
}

// ── ขั้น 3: resize ให้ตรง atlas.json (ถ้าส่งมาและขนาดไม่ตรง) ──────────────────────────
let outPng = png;
if (atlasPath) {
  const atlas = JSON.parse(readFileSync(atlasPath, "utf8"));
  const tw = atlas.width, th = atlas.height;
  if (!Number.isInteger(tw) || !Number.isInteger(th) || tw <= 0 || th <= 0) {
    console.error(`atlas ${atlasPath}: width/height ไม่ถูกต้อง (${tw}x${th})`);
    process.exit(1);
  }
  if (tw === w && th === h) {
    console.log(`ขนาดตรง atlas แล้ว (${tw}x${th}) ไม่ต้อง resize`);
  } else {
    console.log(`resize ${w}x${h} → ${tw}x${th} (ตาม atlas)`);
    // bilinear บน premultiplied alpha — ถ้า interpolate สีตรงๆ สีของ pixel โปร่งใส (มัก=ขาว)
    // จะรั่วเข้าขอบตัวละครเป็นเงาสว่าง
    const src = new Float64Array(w * h * 4);
    for (let p = 0; p < w * h; p++) {
      const a = data[p * 4 + 3] / 255;
      src[p * 4] = data[p * 4] * a;
      src[p * 4 + 1] = data[p * 4 + 1] * a;
      src[p * 4 + 2] = data[p * 4 + 2] * a;
      src[p * 4 + 3] = a;
    }
    const out = new PNG({ width: tw, height: th });
    for (let y = 0; y < th; y++) {
      const sy = Math.min(Math.max(((y + 0.5) * h) / th - 0.5, 0), h - 1);
      const y0 = Math.floor(sy), y1 = Math.min(y0 + 1, h - 1), fy = sy - y0;
      for (let x = 0; x < tw; x++) {
        const sx = Math.min(Math.max(((x + 0.5) * w) / tw - 0.5, 0), w - 1);
        const x0 = Math.floor(sx), x1 = Math.min(x0 + 1, w - 1), fx = sx - x0;
        const o = (y * tw + x) * 4;
        for (let c = 0; c < 4; c++) {
          const v =
            src[(y0 * w + x0) * 4 + c] * (1 - fx) * (1 - fy) +
            src[(y0 * w + x1) * 4 + c] * fx * (1 - fy) +
            src[(y1 * w + x0) * 4 + c] * (1 - fx) * fy +
            src[(y1 * w + x1) * 4 + c] * fx * fy;
          if (c === 3) {
            out.data[o + 3] = Math.round(v * 255);
          } else {
            out.data[o + c] = v; // เก็บ premultiplied ไว้ก่อน unpremultiply ข้างล่าง
          }
        }
        const a = out.data[o + 3] / 255;
        for (let c = 0; c < 3; c++) {
          out.data[o + c] = a > 0 ? Math.min(255, Math.round(out.data[o + c] / a)) : 0;
        }
      }
    }
    outPng = out;
  }
}

// ── ขั้น 4: รายงาน + เขียนไฟล์ ─────────────────────────────────────────────────────
const fw = outPng.width, fh = outPng.height, fd = outPng.data;
const corners = [[0, 0], [fw - 1, 0], [0, fh - 1], [fw - 1, fh - 1]];
const cornerAlphas = corners.map(([x, y]) => fd[(y * fw + x) * 4 + 3]);
console.log(`ตรวจท้าย: ขนาด ${fw}x${fh} · alpha มุมภาพ 4 จุด = [${cornerAlphas.join(", ")}] (ต้องเป็น 0 ทั้งหมด)`);
if (cornerAlphas.some((a) => a > ALPHA_OPAQUE)) {
  console.error("เตือน: มุมภาพยังทึบอยู่ — พื้นอาจยังลอกไม่หมด ลองเพิ่ม --tolerance");
  process.exitCode = 2;
}

const outPath = inPlace ? inputPath : inputPath.replace(/\.png$/i, ".fixed.png");
if (inPlace) {
  copyFileSync(inputPath, `${inputPath}.bak`);
  console.log(`สำรองของเดิม → ${inputPath}.bak`);
}
writeFileSync(outPath, PNG.sync.write(outPng));
console.log(`เขียน → ${outPath}`);
