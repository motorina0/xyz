# nostr-scroll Nostr Calls

Keep this file updated whenever `nostr-scroll` changes how it reads or writes Nostr data.

This document describes the current behavior implemented in:

- `src/components/layout/AppShell.vue`
- `src/stores/feed.ts`
- `src/stores/profiles.ts`
- `src/stores/myRelays.ts`
- `src/services/nostrClientService.ts`
- `src/services/nostrProfileService.ts`
- `src/services/nostrNoteService.ts`
- `src/services/nostrRelayService.ts`

## Relay selection rules

### Read relay set

Every normal read in `nostr-scroll` uses this merged relay list:

1. relay hints passed into the call
2. normalized readable entries from `My Relays`
3. normalized readable entries from `App Relays`
4. hardcoded defaults from `src/constants/relays.ts`

Current default app relays:

- `wss://relay.damus.io`
- `wss://nostr.mom`
- `wss://nostr.bitcoiner.social`
- `wss://nos.lol`
- `wss://relay.snort.social`

The final list is deduplicated in `buildReadRelayUrls()`.

### Write relay set

Every normal publish uses the same merge pattern, but with writable relay entries:

1. relay hints passed into the call
2. normalized writable entries from `My Relays`
3. normalized writable entries from `App Relays`
4. hardcoded default app relays

The final list is deduplicated in `buildWriteRelayUrls()`.

### NDK connection rules

- Generic read/write calls in `nostrClientService.ts` connect with a `4_000ms` timeout.
- My-relay discovery in `nostrRelayService.ts` uses a separate `2_500ms` timeout.
- Generic publishes wait for `1` successful relay ack when at least one relay is configured.
- `nostr-scroll` disables NDK `autoConnectUserRelays` and the NDK outbox model, so reads and writes only use the relay URLs explicitly chosen by the app.

## Startup sequence

On app shell mount:

1. restore auth session
2. initialize `App Relays` from local storage
3. initialize `My Relays` from local storage
4. if authenticated:
   - hydrate `My Relays` from Nostr
   - hydrate the current user profile
   - do not prefetch the home timeline from the app shell

Current default home tab in UI state is `following`.

The home timeline is loaded by `HomePage` for the currently selected tab.

## My relays rules

### Private relay fetch

`fetchPrivateRelayEntries()` only runs for `nip07` logins.

- Source: `window.nostr.getRelays()`
- If the extension does not expose relays, returns an empty list.
- Each relay is normalized into `{ url, read, write }`
- Missing `read` or `write` flags default to `true`

### Public relay fetch

`fetchMyRelayEntries()` then fetches the current user's public relay list:

- Kind: `10002` (`NDKKind.RelayList`)
- Author: current user pubkey
- Read relays used for the fetch:
  - default app relays
  - readable app relays
  - readable private relays from `window.nostr.getRelays()`

Returned result:

- `privateRelayEntries`
- `publicRelayEntries`
- `mergedRelayEntries = normalize(public + private)`

Store behavior:

- replace local `My Relays` with merged relays if the merged list is non-empty
- also replace if local `My Relays` is currently empty

### Relay list publish

`publishMyRelayEntries()` publishes the current `My Relays` state as kind `10002`.

- Seeds write relays from:
  - default app relays
  - writable app relays
  - writable relays from the list being published
- Throws if there is no writable relay available

## Profile rules

### Profile metadata fetch

`fetchProfiles()`:

- Kind: `0` (`Metadata`)
- Authors: the requested pubkeys
- Read relays: standard merged read relay set
- Selection rule: if multiple metadata events exist for one pubkey, use the newest `created_at`

Fallback behavior:

- if metadata is missing, generate a fallback profile from pubkey
- if the fetch fails, store fallback profiles and record an error in the profiles store

Mapped profile fields:

- `name`
- `displayName`
- `about`
- `picture`
- `banner`
- `nip05`
- `website`
- `lud16`
- `location`
- `joinedAt` from the metadata event timestamp
- `verified = Boolean(nip05)`

### Profile fetch caching

`profilesStore.ensureProfiles()` only fetches pubkeys that are not already marked as loaded unless `force = true`.

### Following count fetch

`fetchFollowingCount()`:

- Uses `NDKUser.followSet()`
- Read relays: standard merged read relay set
- Only the `followingCount` is currently derived this way

### Following pubkey fetch

`fetchFollowingPubkeys()`:

- Kind: `3` (`Contacts`)
- Author: current user pubkey
- Read relays: standard merged read relay set
- Extracts followed pubkeys from `p` tags
- Deduplicates the pubkeys

## Home timeline rules

The home timeline has two separate feeds:

- `all`
- `following`

Each feed has its own:

- ids list
- loading state
- error state
- pagination cursor
- `hasMore`

### All tab

`ensureHomeTimelineLoaded('all')` calls `fetchHomeTimelineBatch()` with:

- Kinds: `1` (`Text`) only
- Filter limit: `max(requestedLimit * 3, 30)`
- Default requested limit: `15`
- Optional `until` cursor when paginating
- Authors filter: none

Post selection rule after fetch:

- drop replies from the main timeline
- keep only notes where `getEventReplyId(event)` is empty
- then slice to `15`

Pagination rule:

- next cursor = `lastPrimaryEvent.created_at - 1`

### Following tab

`ensureHomeTimelineLoaded('following')` first fetches the current user's follow list from the contacts event.

If the follow list is empty:

- do not run a timeline event query
- mark the feed as loaded
- set `hasMore = false`
- show the UI message:
  - `Your follow list is empty.`
  - `Start following someone or check what everyone is doing on the "All" tab`

If the follow list is not empty:

- reuse the same `fetchHomeTimelineBatch()` rules as `all`
- add `filters.authors = followPubkeys`

### Home feed hydration side effects

For both home tabs, after primary notes are fetched:

1. fetch related notes referenced by:
   - `replyTo`
   - `rootId`
   - `repostOf`
   - `quotedNoteId`
2. fetch profile metadata for all note authors
3. compute derived interaction stats
4. compute viewer state

## Related note fetch rules

`fetchRelatedEvents()`:

- builds the id list from `replyTo`, `rootId`, `repostOf`, `quotedNoteId`
- skips ids already present in the primary result
- fetches ids in chunks of `40`

Home timeline repost reads are no longer broad timeline queries.
Kind `6` repost events are only fetched in targeted contexts such as:

- viewer repost-state lookups for explicit note ids with `#e = chunk`
- repost-count lookups for explicit note ids with `#e = chunk`
- the profile `reposts` tab

## Interaction and viewer-state rules

### Bookmark state

`buildViewerState()` always loads the current user's bookmark ids first:

- Kind: `10003` (`BookmarkList`)
- Author: current user pubkey
- Extract only `e` tags

### Like and repost state for the current viewer

For the set of visible display note ids:

- chunk size: `24`
- queries per chunk:
  - kind `7` reactions by current user with `#e = chunk`
  - kind `6` reposts by current user with `#e = chunk`

Viewer-state rules:

- like counts as active only when reaction content is `+` or empty string
- repost target is resolved from the repost's `e` tags or embedded event content

### Derived counts shown on notes

For the set of visible display note ids:

- chunk size: `6`
- for each note id in the chunk, issue NIP-45 `COUNT` requests for:
  - kind `1` with `#e = [noteId]`
  - kind `6` with `#e = [noteId]`
  - kind `7` with `#e = [noteId]`

Counting rules:

- replies/comments: all kind `1` events matching the target `#e` tag
- reposts: count repost events targeting the note id
- likes: best-effort count of kind `7` reactions targeting the note id

Important limitation:

- counts are derived only from the relays queried for the current screen
- when relays return HLL data, the merged HLL estimate is used
- otherwise the max count reported by responding relays is used
- if no relay returns a count result, the existing local stat value is preserved

## Notes-by-id rules

`fetchNotesByIds()`:

- deduplicates ids first
- fetches ids in chunks of `40`
- then runs the same related-note, profile, stats, and viewer-state hydration pipeline

## Bookmarks page rules

`loadBookmarks()` calls `fetchBookmarksCollection()`:

1. fetch the current user's kind `10003` bookmark list from read relays
2. extract `e` tag ids
3. fetch those notes by id
4. sort the final bookmark notes by note timestamp descending

## Profile page tab rules

`ProfilePage` resolves the route param as:

- raw hex pubkey
- `npub`
- `nprofile`
- `nostr:` prefixed forms

It then loads:

1. profile metadata for that pubkey
2. following count for that pubkey
3. the selected tab dataset

Current tab query rules:

### Posts tab

- Kind: `1`
- Author: profile pubkey
- Query limit: `60`
- Filter out replies
- Final display limit: `20`

### Replies tab

- Kind: `1`
- Author: profile pubkey
- Query limit: `60`
- Keep only notes where `getEventReplyId(event)` exists
- Final display limit: `20`

### Likes tab

1. fetch authored reactions:
   - Kind: `7`
   - Author: profile pubkey
   - Query limit: `60`
2. keep only reactions whose content is `+` or empty
3. extract target event ids from `e` tags
4. dedupe ids
5. take first `20`
6. hydrate those target notes via `fetchNotesByIds()`

Important limitation:

- liked notes are currently ordered by the hydrated target note timestamps
- exact reaction-time ordering is not preserved

### Reposts tab

- Kind: `6`
- Author: profile pubkey
- Limit: `20`

## Post detail rules

`PostDetailPage` resolves the route param as:

- raw hex event id
- `note`
- `nevent`
- `nostr:` prefixed forms

`fetchThreadCollection()` then does:

1. fetch the focused post by id
2. fetch ancestors from:
   - `rootId`
   - `replyTo`
3. fetch replies with:
   - Kind: `1`
   - `#e = focusedPost.id`
   - Limit: `100`
4. keep only direct replies where `getEventReplyId(event) === focusedPost.id`
5. sort ancestors oldest-first
6. sort replies oldest-first

## Publish rules

### Create note

`createPost()`:

1. insert an optimistic kind `1` note locally
2. add it to the `all` timeline immediately
3. also add it to `following` only if the current author pubkey is already in the loaded follow list
4. publish the real kind `1` event
5. fetch the published note by id
6. replace the optimistic id everywhere it was referenced

### Reply

`replyToPost()`:

1. add an optimistic reply locally
2. increment the parent's reply count optimistically
3. publish using `parentEvent.reply()`
4. refetch the reply and parent note to reconcile counts/state

### Like

`toggleLike()`:

- optimistic viewer-state toggle and optimistic like count update
- if turning on:
  - publish a kind `7` reaction with content `+`
- if turning off:
  - publish a kind `5` deletion for the user's stored reaction event ids
- refetch the target note afterward

### Repost

`toggleRepost()`:

- optimistic viewer-state toggle and optimistic repost count update
- if turning on:
  - publish a kind `6` repost
- if turning off:
  - publish a kind `5` deletion for the user's stored repost event ids
- refetch the target note afterward

### Bookmark

`toggleBookmark()`:

- optimistic viewer-state toggle and optimistic bookmarks list update
- publish a full replacement kind `10003` bookmark list
- refetch bookmarks afterward

### Profile update

`saveCurrentUserProfile()`:

- build a merged profile payload from existing profile + edits
- publish kind `0` metadata to write relays
- then refetch the current user's profile

## Current non-rules

These things are not currently implemented as live subscriptions:

- timeline streaming subscriptions
- live profile subscriptions
- live thread subscriptions

The app currently uses explicit fetches on page load, tab change, pagination, and user actions.


TODOO:
 - for my follow list also fetch reposts (kind 6)
