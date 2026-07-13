// P2-09 — server config barrel (Design Knobs: economy + reinforcement).
// ⛔ SERVER-ONLY (drop tables/rates never enter the client bundle — TA §6.2). Plain TS only.
// Import from "../config" (server/**) — NOT from src/engine|game|ui.

export * from "./types";
export * from "./economy";
export * from "./reinforcement";
export * from "./storage";
export * from "./loader";
