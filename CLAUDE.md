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

## Rules encoded in the engine (don't "fix" these back)

- Thrusters weigh nothing (`itemWeight` in `core.ts`) — each engine is a clean +4 capacity.
- `massOf()` counts the hold as well as the deck.
- `fits()` scores only position-dependent checks (`Check.pos`); fleet-wide checks
  (engine count, power, bunks) would deadlock the annealer (the v3.1 Long-hauler freeze).
- Cargo cells (`@n`) are stripped from the grid on stage carry-over (`gen.ts`) —
  undelivered freight was forfeited at the warp.

## Deploy

- Frontend: Netlify auto-deploy from `main` (`netlify.toml`, base=`web`, publish=`dist`).
  `VITE_SERVER_URL` is set in `netlify.toml`.
- Server: Render blueprint in `render.yaml` (`stowage-server`, health check `/health`).
  Note: save files live on the service disk (`server/data/`), which is ephemeral on
  Render free tier — restarts wipe server saves; clients re-sync from their offline
  cache on next play. Add a Render disk or a real DB before multiplayer.

## Workflow

Issue → branch (`feature/`, `fix:`, `balance/`) → PR → squash merge to `main`.
Conventional commits (`feat:`, `fix:`, `balance:`, `ui:`). Repo: github.com/1Felipe4/stowage.
