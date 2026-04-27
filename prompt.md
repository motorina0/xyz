prompt

App init:
 - if no relays ask the user if it wants the app relays on its profile
 - always use app relays to listen for messages

- login and secrets on mobile

My Relays (NIP-65)
some contacts have weird relays, we should not listen there


confety emoji

@someUser
 - more clear membership management in group chats


- search with @name (for groups)
- fix search for chats&contacts (search for all fields: name, about, given name, npub, pubkey hex)
- notificatinos request on desktop app
- refresh history with date range
- Pin message support.
- For group chat threads for relay-status details (on the dialog) also show the epoch it sent to

- it seams that the relays of a group are lost from time to time, what can be the reason
  when adding a member to the group sometimes the relay list for the group becomes empty
- dialogs on mobile at the bottom, Dialogs on desktop at the top
- check events that were never sent and try to re-send them

- relay status for all publishing actions
  In the Gropu > Members show the updating relays status bar for each member (pulsing when it is sending) slowly filling up to be green or read.
- download as mobile app -> settings tab add an install ico

- Add i18n to this app. Extract all labels that are visible in the UI and create translation file for them.
  Based on the extracted file make translation files for the top 20 languages.
  In Settings > Languages add a language selector.

- Add `Edit` option for a message. The UX is the same as for telegram.

- The app should work offline, load all UI components at start-up.

- when refreshing a users's profile also use the app relays (the user might not have relays)
- make .md from the rules in this app
- file messages


on group restore set members the latest epoch sent invitations
- better nip51 here

- group private key is now saved as NIP78, this data structure must be standardizd so other apps can use it easily



add e2e tests for adding a contact, fetching the profile, relays and other data for that contact. Then the contact changes its data (the loggedn in user should receive the updates immediately)


After accepting a Contact request  if the request count is zero then hide the `Requests (0)` from the chat list items.

testing -> more ports


npm run test:e2e:local


When the app runs in the browser show the unread count badge in the tab title with the number of unread chats

node 24

do not subscribe to all your contacts relays?
remove xyz and tg references




What Reliability Work Comes Next

Build a durable outbox with automatic replay. Right now outbound relay state is tracked well in relayPublishRuntime.ts (line 145), but recovery still leans too much on manual retry. We should retry failed recipient publishes automatically with exponential backoff, jitter, retry budgets, and idempotent replay after app restart.

Make reconnect more aggressive than “re-subscribe and hope.” The watchdog is good, but after wake, focus regain, relay-set changes, or long offline windows, the app should run a targeted gap-repair pass per active or recently active chat, not just a generic live resubscribe. This is where Telegram feels “instant and correct” after bad connectivity.

Define message success in product terms, not raw relay terms. Users care about sending, sent, needs attention, and eventually seen. Today the app records per-relay truth, which is excellent for diagnostics, but we still need a higher-level delivery state derived from those statuses so users aren’t forced to interpret relay internals.

Strengthen multi-device convergence beyond read cursors. Read state already syncs, but mute/archive/pin/draft state does not, and those are part of reliability too because mismatched device state feels broken. The private-state channel in privateStateRuntime.ts (line 2084) is the right place to extend.

Add second-layer dedupe for resend and multi-device races. Current dedupe is event_id based, which is necessary but not sufficient if the same logical message is republished with a different event id from another device or retry path. A client-generated message UUID/tag would let us collapse “same intent, different event” duplicates.

- Repair dependency holes automatically. Reactions, deletions, and replies already queue pending work when targets are missing, which is good, but the app should actively fetch missing targets around those references instead of waiting for them to arrive incidentally. That would reduce “reply to unknown” and delayed reaction/deletion consistency issues.

- Make background behavior first-class. Web currently has browser notifications, and Electron currently exposes unread badge wiring in electron-preload.ts (line 1), but Telegram-level reliability needs service-worker/push or equivalent background catch-up semantics, plus desktop notifications/tray behavior that survives app backgrounding.

Add “honest sync” UI. A tiny offline/reconnecting/catching-up indicator would prevent the app from looking broken during recovery windows. Reliability is partly actual correctness and partly whether the user understands what the app is doing.

Expand chaos testing. The next missing tests are long offline periods, relay flapping during send, two devices sending in the same chat simultaneously, wake-from-sleep recovery, and notification/background resume. The existing e2e base is strong enough that this should be very achievable.

If We Prioritize Ruthlessly
Start with durable outbox + auto replay, then targeted gap repair on resume/reconnect, then logical-message dedupe + multi-device convergence. Those three would move nostr-chat the most toward Telegram’s “it just catches up and does the right thing” feel.

Do you want to rerun the local groups Playwright check with Docker and Node explicitly on PATH?
export PATH=/Applications/Docker.app/Contents/Resources/bin:/Users/moto/.nvm/versions/node/v24.15.0/bin:$PATH; /Users/moto/.nvm/versions/node/v24.15.0/bin/node ./scripts/run-e2e-local.cjs e2e/groups.spec.ts



So I’d use this order now:

Shared lifecycle/runtime consolidation
Pull foreground/background/resume logic into one runtime instead of splitting it between MainLayout, reconnect healing, and notification suppression.
Add a clean cross-platform app-state API for web, electron, and capacitor.
Native notifications
Electron desktop notifications with click-to-open-chat.
Keep browser notifications as-is, but route them through the same shared policy.
This is now more important than “browser hidden-tab notifications” because that part already exists.
Android native app-state + notifications
Wire Capacitor app lifecycle into the shared runtime.
Add Android notification channels, tap-to-open-chat, and badge/unread behavior.
I’d prioritize this before tray work if Android matters.
Push wakeups / background delivery
Android push first via FCM-style wakeups.
Web service worker/push later.
This replaces the old generic “service worker + push backend” phase, because Android is the more realistic first target here.
Tray / minimize-to-tray as an optional desktop UX pass
I would no longer keep tray bundled with Electron notifications by default.
Notifications are core reliability UX; tray is useful, but more opinionated.