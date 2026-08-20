# STOWAGE

A space-freight deck-packing roguelike. Sign contracts, stow the cargo so the deck
clears inspection — heat, power, bunks, shielding, bracing — and jump out with the
wage bill covered.

## Run it

```bash
npm install
npm run dev:server   # save API on :3001
npm run dev          # web on :5173 (proxies /api to the server)
```

## Build

```bash
npm run build        # type-checks and bundles web/ (PWA included)
```

## Deploy

- **Web** — Netlify, auto-deploy from `main` (config in `netlify.toml`).
- **Server** — Render, blueprint in `render.yaml`.
