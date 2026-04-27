# Android Push Notifications Spec

## Purpose

Add true Android background and killed-app push notifications for Nostr Chat.

The v1 implementation uses Firebase Cloud Messaging (FCM) for Android delivery, a dedicated TypeScript gateway service under this repository, SQLite persistence, and Docker deployment. The gateway subscribes only to relays explicitly configured by the user.

This document is the implementation contract for Codex. Do not implement broad rewrites while following it. Keep changes scoped to the app notification client, Android Capacitor wiring, and the isolated gateway service.

## Product Decisions

- Gateway location: `services/push-gateway/` in this repo.
- Gateway runtime: TypeScript on Node.js.
- Deployment: Docker service.
- Database: SQLite for v1.
- Push provider: FCM only for v1.
- Auth: every device registration update must prove Nostr pubkey ownership.
- Relay scope: subscribe only to user-defined relay URLs registered by the app.
- Platform scope: Android v1, with clear extension points for iOS.
- Gateway scope: the gateway only watches NIP-17 delivery wrappers for app-supplied recipient pubkeys. It does not know whether a pubkey is a user inbox, a group epoch, or any future recipient key.
- Notification naming: generic title/body only in v1. Do not send display names, chat names, sender names, or message bodies to the gateway.

## Critical Nostr Constraint

NIP-17 gift wraps do not expose the real sender or message body to observers. The outer `kind:1059` event is addressed to the recipient with a `p` tag, but its author is a random wrapping key and the sender is only visible after decrypting the wrap and seal.

Therefore, a relay-subscribing gateway that does not hold user private keys cannot reliably:

- know the sender of a direct message,
- know the direct-message chat name,
- suppress self-sent direct-message copies,
- inspect message body text,
- verify accepted-chat state from decrypted content.

The gateway must never receive or store user private keys, group private keys, epoch private keys, or NIP-44 decrypted message content.

V1 behavior:

- All relay-detected notifications use a generic title/body such as `Nostr Chat` and `New message`.
- The gateway stores only device data, relay URLs, and watched recipient pubkeys.
- The app owns the meaning of every watched pubkey. For this app, the list contains the logged-in user pubkey and the latest epoch public keys for groups.
- Rich notifications with sender/chat names require a future sender-side push-hint flow or a protocol-level notification hint. That is not part of the relay-observed v1 path.

## Architecture

```text
Android app
  - requests Android notification permission
  - obtains FCM registration token
  - signs Nostr HTTP auth proof
  - registers token, owner pubkey, relays, and watched recipient pubkeys

Push gateway
  - validates signed registration requests
  - stores device/token/relay/watched-pubkey data in SQLite
  - keeps relay websocket subscriptions active
  - detects kind:1059 gift wraps for watched recipient pubkeys
  - sends FCM notification + data payloads

Firebase Cloud Messaging
  - wakes Android and displays notifications when app is backgrounded or killed
```

## App Scope

### Dependencies

Add Capacitor push support under `src-capacitor`:

- `@capacitor/push-notifications`

Keep Capacitor package versions aligned with the existing Capacitor 6 setup.

### Android Configuration

Add the Firebase Android config outside source control:

- `src-capacitor/android/app/google-services.json`

Do not commit real Firebase credentials. Add ignore rules and an example note if needed.

Configure:

- Android 13+ notification permission flow through Capacitor Push Notifications.
- Default FCM notification icon.
- Default notification channel ID.
- Channel creation at app startup.
- Tap handling that routes into the chat app.

The Android package must remain `com.lnbits.nostrchat` unless the user explicitly changes it.

### App Notification Service

Add an app-side service or composable responsible for:

- detecting Capacitor Android runtime,
- checking push permission,
- requesting push permission from a user action,
- registering with FCM,
- listening for FCM token registration and token refresh,
- registering/unregistering the token with the gateway,
- handling notification taps,
- reporting registration failures through the existing UI error path.

Suggested files:

- `src/services/pushGatewayClient.ts`
- `src/services/androidPushNotificationService.ts`
- `src/utils/notificationPreference.ts` or a rename of the current browser-specific helper if that is cleaner.

Do not overload `browserNotificationPreference.ts` with Android-only complexity unless it is renamed or wrapped with a clearer cross-platform API.

### Settings UI

Update `src/pages/settings/NotificationsSettingsPage.vue` so the same page can represent:

- web browser notifications,
- Electron desktop notifications,
- Android push notifications.

Expected Android copy:

- Enabled state: "Show Android push notifications"
- Enabled caption: "Show a notification when new messages arrive while this device is in the background."
- Denied caption: tell the user to allow notifications in Android settings.
- Registration failure: show a concise Quasar warning and keep the toggle off.

Keep existing desktop and web behavior intact.

### Login and Logout

On login/register after the notification opt-in:

1. request Android push permission,
2. register with FCM,
3. register the device with the gateway,
4. persist the local preference only after gateway registration succeeds.

On logout:

1. unregister the device from the gateway,
2. unregister/delete the FCM token where supported,
3. clear local notification preference and local device ID.

Logout must continue even if gateway unregister fails; report the failure without blocking local cleanup.

### Registered Relay Set

The app must send only user-defined relays to the gateway.

Do not send fallback/default relays from runtime helpers. If no user-defined read relays are available, registration must fail with a user-visible message that relays are required for push notifications.

Normalize relay URLs with the existing sanitizer/value helpers before sending them.

### Registered Watched Pubkeys

The app sends the gateway a watched-pubkey list that lets the gateway subscribe without secrets or app semantics.

Required watched pubkeys:

- logged-in user pubkey,
- latest group epoch public keys for groups the user can currently receive.

The gateway must treat every watched pubkey as an opaque NIP-17 recipient key. It must not store target kind, chat pubkey, route, title, display name, or group metadata.

When a group epoch rotates, the app must replace the old epoch public key with the new one so the gateway stops listening to old epoch public keys for live notifications.

## Gateway Scope

### Location

Create the gateway as an isolated service:

```text
services/push-gateway/
  package.json
  tsconfig.json
  src/
  tests/
  Dockerfile
  .env.example
  README.md
```

The gateway must not import browser-only app modules. Shared normalization logic may be duplicated initially or extracted into a small shared package only if that keeps the change simple.

### Suggested Libraries

- HTTP server: Fastify or Hono.
- Nostr signing/auth validation: `nostr-tools` or NDK if it cleanly supports the needed server-side operations.
- Relay subscriptions: `nostr-tools` SimplePool or NDK.
- FCM: `firebase-admin`.
- SQLite: `better-sqlite3` or another maintained synchronous/asynchronous SQLite package.
- Tests: Vitest.

Prefer the smallest dependency set that keeps the implementation readable.

### Environment

Required environment variables:

- `PORT`
- `DATABASE_PATH`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `PUBLIC_GATEWAY_BASE_URL`
- `NIP98_MAX_CLOCK_SKEW_SECONDS`
- `RELAY_CONNECT_TIMEOUT_MS`
- `RELAY_IDLE_RESTART_MS`

Do not log Firebase private keys, FCM tokens, NIP-98 authorization headers, or full request bodies containing tokens.

### Authentication

Use NIP-98-style HTTP auth for gateway writes:

- request uses `Authorization: Nostr <base64-json-event>`,
- signed event kind is `27235`,
- event has `u` tag equal to the absolute request URL,
- event has `method` tag equal to the HTTP method,
- POST/PUT/PATCH/DELETE requests include a `payload` tag containing the SHA-256 hash of the exact request body,
- event timestamp must be within the configured clock-skew window,
- event signature must verify,
- event pubkey is the authenticated owner pubkey.

The request body `ownerPubkey` must match the authenticated event pubkey. If it does not, return `401`.

If NIP-98 helpers are added to the app, update `NIPS_USED.md` to include NIP-98.

### API

#### `GET /healthz`

No auth. Returns service status.

#### `POST /v1/devices/register`

NIP-98 auth required.

Request:

```json
{
  "ownerPubkey": "<64-char hex>",
  "deviceId": "<stable app-generated device id>",
  "platform": "android",
  "appVersion": "0.1.0",
  "fcmToken": "<fcm token>",
  "relays": [
    { "url": "wss://relay.example", "read": true }
  ],
  "watchedPubkeys": [
    "<owner pubkey>",
    "<current group epoch pubkey>"
  ],
  "notificationsEnabled": true
}
```

Behavior:

- normalize and validate pubkeys,
- normalize and validate relay URLs,
- replace all relays and watched pubkeys for that owner/device atomically,
- store the FCM token for delivery,
- restart affected relay subscriptions,
- return registered watched pubkey and relay counts.

#### `POST /v1/devices/unregister`

NIP-98 auth required.

Request:

```json
{
  "ownerPubkey": "<64-char hex>",
  "deviceId": "<stable app-generated device id>"
}
```

Behavior:

- mark the device disabled or delete it,
- remove its FCM token,
- remove watched pubkey subscriptions if no remaining device needs them.

#### `POST /v1/devices/refresh`

NIP-98 auth required.

Same payload shape as register, but intended for relay list, watched pubkey, or token refresh updates.

V1 may implement this by calling the same service function as register.

### SQLite Schema

Use migrations. Do not rely on implicit `CREATE TABLE` drift.

Minimum tables:

- `devices`
  - `id`
  - `owner_pubkey`
  - `device_id`
  - `platform`
  - `fcm_token`
  - `app_version`
  - `notifications_enabled`
  - `created_at`
  - `updated_at`
  - unique `(owner_pubkey, device_id)`
- `device_relays`
  - `device_id`
  - `owner_pubkey`
  - `relay_url`
  - `read`
  - `created_at`
  - unique `(owner_pubkey, device_id, relay_url)`
- `watched_pubkeys`
  - `id`
  - `owner_pubkey`
  - `device_id`
  - `recipient_pubkey`
  - `created_at`
  - `updated_at`
  - unique `(owner_pubkey, device_id, recipient_pubkey)`
- `seen_events`
  - `event_id`
  - `recipient_pubkey`
  - `relay_url`
  - `first_seen_at`
  - `notified_at`
  - unique `(event_id, recipient_pubkey)`

Timestamps are ISO strings.

### Relay Worker

The gateway maintains live relay subscriptions for registered watched recipient pubkeys.

Filter:

```json
{
  "kinds": [1059],
  "#p": ["<recipient pubkey 1>", "<recipient pubkey 2>"]
}
```

Implementation rules:

- group watched pubkeys by relay URL,
- subscribe only to read relays registered by users,
- reconnect with backoff,
- deduplicate events by `(event id, recipient pubkey)`,
- never unwrap or decrypt events,
- never publish to relays,
- avoid sending multiple notifications for the same event seen on multiple relays,
- rebuild subscriptions when registrations, unregisters, or refreshes change the active watched pubkey set.

### Notification Rendering

FCM payloads must include both notification and data fields so Android can display while killed and the app can decide what to do after tap.

Relay-detected notification:

```json
{
  "notification": {
    "title": "Nostr Chat",
    "body": "New message"
  },
  "data": {
    "recipientPubkey": "<matched watched recipient pubkey>",
    "eventId": "<gift wrap event id>"
  }
}
```

The gateway must not include route, target kind, chat pubkey, title overrides, display names, sender names, or decrypted message content in v1. The app may use `recipientPubkey` locally after launch to decide whether it maps to the user inbox, a current group epoch, or an unknown/stale recipient.

### iOS Extension Points

Keep platform fields generic:

- `platform`: `android` in v1, later `ios`
- push provider module: `fcmProvider` in v1 behind a small `PushProvider` interface
- token column name may remain `fcm_token` for v1, but service-level types should use `providerToken`
- watched recipient pubkeys stay platform-neutral

Do not implement APNs in v1.

## Security And Privacy

- Never send private keys to the gateway.
- Never send decrypted message content to the gateway.
- Never log FCM tokens, auth headers, Firebase credentials, or full registration payloads.
- Do not send display names, group names, sender names, chat routes, or chat metadata to the gateway.
- Validate all pubkeys and relay URLs before storing.
- Use constant, bounded request body sizes for registration endpoints.
- Use rate limits per pubkey and per IP.
- Delete disabled device tokens promptly.
- Handle FCM invalid-token responses by disabling that device.

## Implementation Phases

### Phase 1: Spec-Backed Gateway Skeleton

- Create `services/push-gateway`.
- Add HTTP server, config loader, logging, health endpoint.
- Add SQLite migrations and repository layer.
- Add NIP-98 auth validation middleware.
- Add unit tests for auth, normalization, persistence, and token redaction.

### Phase 2: Gateway Push Pipeline

- Add register/unregister/refresh endpoints.
- Add relay subscription worker.
- Add FCM provider.
- Add dedupe and invalid-token handling.
- Add unit tests for subscription planning and notification rendering.

### Phase 3: Android App Integration

- Install Capacitor push plugin.
- Configure Android FCM, permission, icon, and channel.
- Add app-side push service and gateway client.
- Update notification settings page.
- Register after login/opt-in and unregister on logout.
- Handle notification tap routing.

### Phase 4: Group Epoch Updates

- Add current group epoch public keys to the watched pubkey list after restore.
- Refresh watched pubkeys after group creation, ticket receipt, and epoch rotation.
- Remove stale epoch public keys from the watched pubkey list.

### Phase 5: Hardening

- Add Dockerfile and local compose example for the gateway.
- Add operational README.
- Add retry/backoff observability.
- Add rate limiting.
- Add integration test path with mocked FCM and local relay.

## Acceptance Criteria

Gateway:

- `GET /healthz` returns success without auth.
- Registration requests without valid NIP-98 auth are rejected.
- Registration requests with mismatched `ownerPubkey` are rejected.
- Registration stores Android FCM token, user relays, and watched pubkeys in SQLite.
- Refresh replaces relays and watched pubkeys atomically.
- Unregister disables/removes the device token.
- Gateway subscribes only to user-registered relays.
- Gateway watches only registered `kind:1059` `#p` recipient pubkeys.
- Gateway has no direct-message or group-specific branching.
- Duplicate event sightings across relays produce at most one FCM send per recipient pubkey/device.
- FCM invalid-token responses disable that device.
- Logs redact tokens and auth headers.

Android app:

- Notification settings still work for browser and Electron.
- Android runtime shows Android push-specific copy.
- Toggle-on requests Android notification permission and FCM registration.
- Toggle-on registers the device with the gateway only after pubkey ownership proof is signed.
- Toggle-off unregisters the device from the gateway.
- Logout attempts gateway unregister and still completes local logout if the gateway is unavailable.
- Notification tap opens the app and lets the app resolve the matched `recipientPubkey` locally.
- No fallback/default relays are sent to the gateway.
- Group epoch rotation refreshes watched pubkeys.

Protocol and privacy:

- User private keys, group private keys, epoch private keys, and decrypted message bodies are never sent to the gateway.
- Direct-message sender names are not claimed in relay-detected v1 notifications because the gateway cannot know them without decryption.
- Group display names, chat names, routes, and target kinds are not sent to the gateway.

## Validation Commands

After app or shared code changes:

```bash
npm run quality:all
npm run test:unit
npm run test:e2e:local:dm-smoke
```

After group epoch watched-pubkey changes:

```bash
npm run quality:all
npm run test:unit
npm run test:e2e:local:groups-smoke
```

After Android platform changes:

```bash
npm run quality:all
npm run test:unit
npm run build:android:local:sync
```

After gateway-only changes:

```bash
cd services/push-gateway
npm run format
npm run lint
npm run typecheck
npm run test
docker build -t nostr-chat-push-gateway .
```

Before considering the full feature complete:

```bash
npm run quality:all
npm run test:unit
npm run test:e2e:local
npm run build:android:local:sync
cd services/push-gateway
npm run test
docker build -t nostr-chat-push-gateway .
```

Manual device validation:

- Android 13+ permission grant.
- Android 13+ permission denial.
- Foreground app notification behavior.
- Backgrounded app notification behavior.
- Killed/swiped app notification behavior.
- Notification tap handling.
- Token refresh.
- Logout unregister.
- Group epoch rotation watched-pubkey refresh.

## References

- Capacitor Push Notifications v6: https://capacitorjs.com/docs/v6/apis/push-notifications
- Firebase Android receive behavior: https://firebase.google.com/docs/cloud-messaging/android/receive-messages
- NIP-98 HTTP auth: https://github.com/nostr-protocol/nips/blob/master/98.md
- NIP-17, NIP-59, NIP-65, NIP-78, NIP-171 notes: `NIPS_USED.md`, `nip171.md`, `nip171b.md`
- Current notification runtime: `src/stores/nostr/inboundPresentationRuntime.ts`
- Current settings page: `src/pages/settings/NotificationsSettingsPage.vue`
