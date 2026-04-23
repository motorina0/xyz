# nostr-scroll

Standalone Quasar + Vue Nostr social client with a relay-backed home feed, profiles, follows,
and local relay-backed smoke coverage.

## Run locally

```bash
npm install
npm run prepare:quasar
npm run dev
```

## Quality checks

```bash
npm run quality:all
npm run test:unit
npm run build
```

## Relay-backed smoke test

```bash
npm run test:e2e:local:smoke
```

## Build

```bash
npm run build
```

## Standalone repo scaffolding

- `.github/workflows/ci.yml` runs quality, unit, build, and relay-backed smoke checks.
- `.github/workflows/pages.yml` is ready for GitHub Pages deployment if this folder becomes its own repo.
- `biome.json`, `vitest.config.ts`, `playwright.config.ts`, and `docker-compose.e2e.yml` are local to
  this app so they can move with it cleanly.

## Notes

- This app is intentionally self-contained and should not depend on the parent `nostr-chat` folder.
- Session state persists in `localStorage`; cached profiles persist in IndexedDB.
- For hermetic relay-backed testing, `dev:e2e` sets `VITE_DEFAULT_APP_RELAYS` to local relay URLs.
