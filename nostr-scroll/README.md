# nostr-scroll

Standalone Quasar + Vue mock social client prototype with Nostr-shaped data.

## Run locally

```bash
npm install
npm run prepare:quasar
npm run dev
```

## Build

```bash
npm run build
```

## Notes

- This app is intentionally self-contained and should not depend on the parent `nostr-chat` folder.
- Session and interaction state persist in `localStorage`.
