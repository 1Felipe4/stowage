# STOWAGE

Space-freight deck-packing roguelike. Pick a hull, sign contracts, arrange the deck
so it clears inspection, burn between nodes, and warp out ahead of the wage bill.
Single-player today; the server exists so saves are authoritative and multiplayer
can land later without re-architecting.

## Stack

- `web/` — React 18 + Vite 5 + TypeScript (strict). Plain CSS in `src/index.css`.
  PWA via `vite-plugin-pwa` (installable, offline-capable, auto-updating SW).
- `server/` — Node + Express run via tsx (no build step). Save storage + session tokens.
- npm workspaces at the root. `npm run dev` (web, port 5173, proxies `/api` → :3001),
  `npm run dev:server` (server, port 3001).

## Architecture

- `web/src/engine/` — the whole game sim, no React imports. One mutable `GameState`
  (`state.ts`, the prototype's global `R`); React subscribes via `useSyncExternalStore`
  on a version counter. `gen.ts` generates stages, `solver.ts` proves each stage
  profitable (Held-Karp over pickup/drop points), `core.ts` holds `evaluate()` (deck
  inspection) and `fits()` (layout annealer).
- `web/src/ui/` — components. `RunView.tsx` is the main screen.
- `web/src/net/saves.ts` — server-side saves. localStorage keeps only the opaque
  session token plus an offline cache for PWA play; the server copy is canonical.
- `prototype/stowage-v31.html` — the original single-file prototype, kept for reference.

## Tests

- `npx tsx web/test/fuzz.ts [runs] [seed]` — E2E fuzz: random-but-legal play through
  the real actions, engine invariants asserted after every step, save/load
  round-trips, and semantic verification of every declared stuck-lock.
- `npx tsx web/test/pilot.ts [runs] [stages] [seed]` — winnability: a scripted
  pilot flies the solver's proven contract plan; fails the build if under 70%
  stage clears.
- `npx tsx web/test/bridge.ts` — bay coverage (`coverage()`), the plotted-burn
  confirmation flow, and course plotting (route agrees with dijkstra, advances
  on travel, auto-clears on arrival).
- `npx tsx web/test/share.ts` — run-card facts for every ending.
- `npx tsx web/test/screens.ts` — lesson/tutorial content, tutorial predicates
  against real state, and run-end scoring. All run headless (no DOM needed).

## Rules encoded in the engine (don't "fix" these back)

- Thrusters weigh nothing (`itemWeight` in `core.ts`) — each engine is a clean +4 capacity.
- `massOf()` counts the hold as well as the deck.
- `fits()` scores only position-dependent checks (`Check.pos`); fleet-wide checks
  (engine count, power, bunks) would deadlock the annealer (the v3.1 Long-hauler freeze).
- Cargo cells (`@n`) are stripped from the grid on stage carry-over (`gen.ts`) —
  undelivered freight was forfeited at the warp.
- `genStage` caps reseed recursion (`lastResort` after 3 depths): a bloated carry
  can make the profit floor unsatisfiable on every map, which previously recursed
  into a stack overflow (frozen tab on PRESS ON).
- Module purchases land directly in a clear bay (`buyMod`), never the hold; the
  hold is only for signed cargo and salvage events.
- Stowing cargo at its destination delivers immediately (`tapBay` → `dropOff`).
- `stuckReason()` knows pawning can only shed surcharge, never cover a lane's
  base fuel cost — and that a warp point with warp fuel is always an escape.
- Deckhands run *mass*, not particular bays: each hand covers 4 mass and
  `coverage()` fills in bay order from A1, so the deck tail goes idle first.
  Zero-mass items (thrusters) always read active. This is presentation over the
  existing surcharge rule — coverage does not gate anything on its own.
- Travel is always confirmed: chart nodes and lane cards both call `askJump()`,
  which stores a `JumpPlan` (with `why` when blocked); only `confirmJump()` moves
  the ship, and it routes through `jump()` so fuel and inspection are re-guarded.

## Screens, teaching, scores

- `ui.screen` routes menu / scores / lessons / bridge; the menu is the front door
  and a live save appears there as "Continue run".
- `engine/teach.ts` holds the four lesson cards and the seven guided-run steps.
  Tutorial `done` predicates are written against live state (not a fixed demo
  board) so they hold on any generated sector; satisfied steps are skipped. The
  guided run deliberately starts on the Long-hauler — it ships with one engine,
  so "fit a second engine" is a real task.
- Highscores need **no database**: they live in the same per-session JSON file as
  the save (`server/data/saves/<hash>.json`, top five only), with localStorage as
  the durable client copy. Both handlers merge rather than replace the record —
  a save write must not wipe the board, and vice versa.
- Runs are scored in one place (`finishRun` in actions.ts), covering retire,
  scuttle, CALL IT, and busting on the wage bill; `endKind` makes it idempotent.

## Deploy

- Frontend: Netlify auto-deploy from `main` (`netlify.toml`, base=`web`, publish=`dist`).
  `VITE_SERVER_URL` is set in `netlify.toml`.
- Server: Render web service `stowage` (created via dashboard, not the blueprint),
  live at https://stowage-iua0.onrender.com, rootDir `server`, health check `/health`,
  auto-deploys on push to `main`. `render.yaml` documents the same shape but is unlinked.
  Note: save files live on the service disk (`server/data/`), which is ephemeral on
  Render free tier — restarts wipe server saves; clients re-sync from their offline
  cache on next play. Add a Render disk or a real DB before multiplayer.

## Workflow

Issue → branch (`feature/`, `fix:`, `balance/`) → PR → squash merge to `main`.
Conventional commits (`feat:`, `fix:`, `balance:`, `ui:`). Repo: github.com/1Felipe4/stowage.
