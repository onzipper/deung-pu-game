# Context pack: ui (src/ui + src/app — React overlay / HUD / Next.js shell)
Scope: `src/ui/**`, `src/app/**` (+ tests) · Read this pack + the files in your brief. Spec detail via the cited §.

## Contract
- `src/ui/**` + `src/app/**` = React/DOM over the canvas — HUD, inventory, market, settings, hub/auth pages.
- UI reads/commands the game only through the **Zustand bridge** — never touch engine/world state directly.
- The game loop pushes what UI must see (HP, cooldown) into the store; UI sends intents back, never mutates world state itself.
- Imperative commands (e.g. `setDepthDebug`) go through the `EngineHandle` accessor, not the store (the store is read-only "engine→UI").
- Next.js 16 + React 19 + Tailwind v4 — read `AGENTS.md` before writing framework code (breaking changes vs training data).

## Key files
- `src/ui/GameCanvas.tsx` — mount bridge; holds `EngineHandle` in a `useRef` (not useState)
- `src/ui/store/game-store.ts` — **vanilla** Zustand store (import from zustand/vanilla only, **no React import** — app.ts imports it directly)
- `src/ui/store/use-game-store.ts` — "use client" hook wrapping the vanilla store
- `src/ui/DebugOverlay.tsx` — F3 overlay via `useGameStore(selectDebugInfo)`
- `src/ui/debug-overlay-logic.ts` — pure UI/toggle reducer (not part of the bridge)
- `src/ui/panels/` — shared panel/window framework: wrap the tree in `<PanelProvider>`, call `usePanelManager().openPanel(id)`/`closePanel(id)` anywhere, render `<Panel id title>children</Panel>`. Panel open/closed state is **plain React Context + useReducer, not the Zustand bridge** — it's UI-only (never engine→UI snapshot data), see the rationale comment in the PanelContext source. Handles desktop-float/mobile-bottom-sheet (DG spec §13), Esc-to-close, z-order, and blocks keydown from reaching the engine's keyboard tracker while any panel is open (capture-phase stopPropagation on window). PanelProvider is mounted in `src/ui/GameCanvas.tsx` (first/only host). Shop (P2-11) / help-hint (P2-12) still build on this.
- `src/ui/panels/inventory/` (P2-07) — bag grid (capacity slots) + equipment list + equip/unequip buttons, HUD button + "I" hotkey to open. `src/ui/store/game-store.ts`'s HudState gained an inventory/inventoryRejection slice, written **event-driven** (not the throttled hudPublisher — setInventoryState/setInventoryRejection, called from `src/engine/runtime/app.ts`'s net handlers on MSG_INVENTORY_STATE/MSG_INVENTORY_OP_REJECTED). Equip/unequip/move intents go out via EngineHandle.net's sendEquipItem/sendUnequipItem/sendMoveItem (`src/engine/net/net-client.ts`) — imperative, not the store. No drag-drop this round (buttons only, mobile-first). Item display is raw itemId (no client catalog yet — TODO points at SVG-01).
- `src/app/hub/page.tsx` — Game Hub route (auth/upgrade panels, character grid) — see the router.refresh trap
- `src/app/game/boot-gate.ts` — pure DI entry gate (Storage §5), reads fresh character/map before mount

## Invariants (locked UI direction — GS §45–§47)
- Ancient Asian Fantasy UI + Modern Readability; palette GS §46.1, rarity §46.3, status §46.4. Owner refs in `docs/design/art-reference/` — don't drift off-tone.
- HUD compact, never blocks combat; boss telegraph outranks the HUD always.
- Confirmation modal mandatory for market purchase / enhancement / rare item / using `เกรี้ยว` (higher visual weight than normal).
- Two responsive modes: PC keybind / touch big buttons (TA L11). UI/system copy is never joke/pun text — memes live in content, not UI (GS §2).
- damage numbers live on the engine side (`BitmapText` in canvas), never DOM.

## Zustand bridge (P2-01, installed)
- Direction: game-loop ticker → `createHudPublisher(intervalMs).publish(...)` (throttled ~250ms per the `pollIntervalMs` knob) → `gameStore`.setState → React `useGameStore(selector)`. UI never imports the engine to read values.
- `HudState` = the throttled snapshot slice every screen needs (currently `debugInfo`; add new slices on the same interface). Never raw world state (TA §2).

## Traps
- **Next.js 16 ≠ what the model remembers** — Symptom: code follows old Next conventions and the API/structure doesn't match. Cause: breaking changes vs training data. Rule: read `node_modules/next/dist/docs/` before writing framework code (per `AGENTS.md`).
  full story: docs/history/2026-07-13-known-traps-archive.md#nextjs-16-is-not-what-the-model-remembers
- **Passing `fetch` as a DI property → "Illegal invocation"** — Symptom: `deps.fetchFn(...)` throws `TypeError: Illegal invocation` in the browser (this≠window); a best-effort try/catch swallows it; vitest/undici doesn't brand-check so tests pass — the bug only shows in a real browser. Rule: wrap as `(input, init) => fetch(input, init)` (or `fetch.bind(globalThis)`) and call via a local binding (`const f = deps.fetchFn; f(...)`). Tests must simulate the brand-check (`makeBrowserFetch`).
  full story: docs/history/2026-07-13-known-traps-archive.md#passing-fetch-as-a-di-propertycallback--illegal-invocation-in-the-browser-node-never-catches-this
- **router.refresh() doesn't reset useState** — Symptom: logout then login at /hub, the character list stays empty until a full page refresh. Cause: the Server Component re-runs and sends fresh props, but React keeps the client instance so the `useState(initialProps)` initializer never re-runs. Rule: a component that seeds state from server props across an auth boundary must bind `key` to identity (`key={session.accountId}` / `key="anon"`); don't "fix" it with a props→state useEffect.
  full story: docs/history/2026-07-13-known-traps-archive.md#routerrefresh-doesnt-reset-a-client-components-usestate--state-carries-over-across-loginlogout
- **StrictMode double-mount churns the engine** (half of the reconnect trap) — Symptom (dev): createEngine is async + destroy runs on cleanup → engine1 joins/persists the token then is destroyed before engine2 = position lost + a self-vs-self seat race. Rule: guard with `setTimeout(0)` in `src/ui/GameCanvas.tsx` (StrictMode's cleanup clears the timer before it fires → the engine is created once). The full reconnect story + the sessionStorage-token half live in server.md.
  full story: docs/history/2026-07-13-known-traps-archive.md#reconnect-token-in-memory--strictmode-double-mount--refresh-turns-you-into-a-new-player--2-tabs-cant-see-each-other-p1-07-fix

## Tests & commands
- `npm test` (unit + docs path-guard). E2E Playwright is added when a real flow exists.
