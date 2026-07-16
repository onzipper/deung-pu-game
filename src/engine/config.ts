// Engine shared config + types — barrel.
// Design Knobs live in domain modules under ./config/*; import from "@/engine/config" (or relative) as before.
// Plain TS only — ห้าม import React / Next.js / pixi.js runtime ที่นี่ (type-only ได้ถ้าจำเป็น).

export * from "./config/scene";
export * from "./config/player";
export * from "./config/auto-pilot";
export * from "./config/companion";
export * from "./config/mob";
export * from "./config/combat";
export * from "./config/combat-feel";
export * from "./config/input";
export * from "./config/net";
export * from "./config/render";
export * from "./config/world";
export * from "./config/engine";
