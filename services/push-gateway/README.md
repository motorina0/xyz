# Push Gateway

TypeScript gateway for Android killed-app push notifications.

The service stores Android FCM tokens, user-defined relay URLs, and opaque NIP-17 watched recipient pubkeys in SQLite. It subscribes to `kind:1059` gift-wrap events with matching `#p` tags and sends generic FCM notifications.

The gateway must not receive user private keys, group keys, display names, chat routes, or decrypted message content.

## Development

```bash
npm install
npm run typecheck
npm run test
npm run dev
```

## Configuration

Copy `.env.example` into the runtime environment and set Firebase credentials through environment variables. Use escaped newlines in `FIREBASE_PRIVATE_KEY` or provide a value with literal line breaks.
