import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Colyseus server = แยก process + own tsconfig (legacy decorators, node env) — lint แยกไม่ผ่าน Next config
    "server/**",
    // harness worktrees/cache (git-ignored) — เป็น checkout แยก + มี .next build artifacts ของตัวเอง; ห้าม lint
    // (default ignores ".next/**"/"server/**" เป็น root-relative จึงไม่ครอบ path ซ้อนใน worktree).
    ".claude/**",
  ]),
]);

export default eslintConfig;
