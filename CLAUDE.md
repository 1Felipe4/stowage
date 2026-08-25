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
- `npx tsx web/test/heat.ts` — heat geometry, ambient scaling, feasibility at depth.
- `npx tsx web/test/flavour.ts` — cargo goods/clients: kind-matched, unique per
  board, deterministic per seed, and never load-bearing for rules.
- `npx tsx web/test/ships.ts` — silhouettes, traits, dealer placement/tiers, and
  trading up (net price, modules to hold, refusals).
- `npx tsx web/test/migrate.ts` — legacy saves load: missing `ships`, retired hull
  ids, modules stranded in cells a hull lacks, over-cap fuel, and junk input.

The pilot starts every run on the starter, like real play, and reports per-stage
clear rates. The healthy shape is a forgiving stage 1 (~83%) falling off from
stage 3 as ambient heat arrives (~40-60%) — judge that curve, not just the total.
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

## Ships

Hulls differ by silhouette and by trait, which is what makes a dealer worth
visiting. The grid is always 20 cells; `hull.blocked` lists the cells a hull does
not have, so each ship is a different shape to solve:

| hull | bays | base | heat cap | fuel | price |
|---|---|---|---|---|---|
| Yard skiff (starter) | 14 | 4 | 5 | x1.00 | free |
| Tug | 15 | 3 | 6 | x1.15 | 700 |
| Standard freighter | 16 | 5 | 5 | x1.00 | 1100 |
| Long-hauler | 18 | 7 | 5 | x0.85 | 2200 |
| Ore whale | 20 | 10 | 6 | x1.20 | 4000 |

- **Every run starts on the skiff.** There is no hull picker; you buy your way up.
  `hull.mods`/`hull.crew` are therefore only ever read for the starter — a bought
  hull arrives bare and your modules land in the hold to re-stow. Keep every
  hull's `mods` sane anyway so it is not a trap if that ever changes.
- Shipyards: every warp point deals, plus ~1 port in 4. `tierFor(stage)` caps
  what they stock, so early sectors sell small. `shipPrice()` nets off `tradeIn()`,
  which is your current hull's price at the local buy-back rate.
- Traits are centralised: **all** lane-fuel maths goes through `laneFuel()`/
  `laneCost()` in core.ts, and the heat cap is `R.hull.heatCap`. Never inline a
  lane cost — the multiplier will be forgotten in one place and not another.
- `solveStage()` rejects any plan whose `planCost().bays` exceeds `bays()`, so a
  small hull is offered smaller runs instead of impossible ones. Without this the
  generator promised plans a 14-bay deck could not physically hold.
- Saves re-resolve `hull` by id from `HULLS` on load, so balance changes reach
  old saves instead of a frozen copy travelling forward.

## Save migration (read before adding a field)

`engine/migrate.ts` runs on **every** load, server or offline cache. Saves outlive
schemas: a run written before shipyards has nodes with no `ships`, and reading
`n.ships.filter(...)` on one of those crashed the bridge in production. When you
add a field to `GameState` or `NodeT`, add its default here in the same commit.
It also re-resolves the hull by id, backfills `ambient`/`delivered`, moves modules
out of cells the current hull no longer has (into the hold, to re-stow), clamps
fuel to the tanks fitted, and refuses junk outright rather than half-loading it.
`web/test/migrate.ts` covers all of that, including the exact production crash.

## Contract flavour

`engine/flavour.ts` holds goods names per cargo kind and a list of consignors.
`gen.ts` stamps each contract with `goods` and a board-unique `client`. This is
cosmetic only — every rule keys off `kind`, never these strings — so it is safe
to extend the word lists freely. Seeded from the stage rng, so a plan code always
tells the same story.

## Heat is the escalating axis

Heat used to be decorative: an audit of 160 starting decks found the hottest bay
ever seen was 4 against a cap of 5, and no arrangement could break it. Now:

- Reactors spill 2 (was 1) and thrusters spill 1 (was 0), so a dense power
  cluster is illegal and spacing/shielding is a real decision from stage 1.
- `R.ambient` adds background heat to every bay: `min(3, floor((stage-1)/2))`.
  A deck that cleared inspection last stage can fail the next, so cooling is an
  ongoing investment rather than a one-off. Capped at 3 because beyond that even
  a cooled reactor cannot be placed at all.
- Two guards keep it from soft-locking: `RAD` is forced into the first port's
  stock whenever ambient > 0, and a fresh start at depth gets a radiator per
  reactor in its kit (a bare reactor reads 3 + ambient and cannot be arranged out).
- Shielding manages heat **at the source** while cooling pulls it out of a bay:
  each shielded face cuts what that reactor/engine pushes into its other
  neighbours by 1 (`effectiveSpill`), for no power. A shielded bay also takes no
  spill itself. It never protects bays *beyond* it — spill only ever travels one
  cell, so there is no shadowing.
- `whyMod('RAD'/'CRY')` reports cooling as NEEDED when any bay is over the line,
  or sitting on it with more ambient still to come — this is what makes the
  market flag it, and what lets the scripted pilot survive depth.
- `web/test/heat.ts` locks all of this down, including that cold chain is still
  satisfiable under ambient and that a hot bag can still be laid out at ambient 3.

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
