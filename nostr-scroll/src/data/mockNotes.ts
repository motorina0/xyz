import type { FeedPersistenceState, NostrNote, ViewerPostState } from '../types/nostr';
import { CURRENT_USER_PUBKEY } from './mockProfiles';
import { createPostMediaDataUri } from './mockMedia';

const currentUser = CURRENT_USER_PUBKEY;

const mockPostMedia = {
  launchDeck: createPostMediaDataUri(
    'LIVE NOW',
    'ship smaller social surfaces first',
    '#111827',
    '#2563eb',
    '#8b5cf6',
  ),
  fieldNotes: createPostMediaDataUri(
    'FIELD NOTES',
    'mapping product polish to protocol edges',
    '#1b1024',
    '#db2777',
    '#38bdf8',
  ),
  designOps: createPostMediaDataUri(
    'DESIGN OPS',
    'dark timelines only work when spacing breathes',
    '#102332',
    '#0f766e',
    '#f59e0b',
  ),
};

type NoteSeed = Omit<NostrNote, 'createdAt'> & { minutesAgo: number };

function isoMinutesAgo(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function note(seed: NoteSeed): NostrNote {
  return {
    ...seed,
    createdAt: isoMinutesAgo(seed.minutesAgo),
  };
}

const topLevelSeeds: NoteSeed[] = [
  {
    id: 'note-ada-001',
    pubkey: currentUser,
    kind: 1,
    minutesAgo: 5,
    content:
      'Some products only need one screen to tell you whether they respect your time. Dense, calm, legible wins every time.',
    quotedNoteId: 'note-jules-001',
    tags: [['liked-by', 'pk-mina-threads']],
    stats: { replies: 4, reposts: 19, likes: 182, bookmarks: 38, views: 9200 },
  },
  {
    id: 'note-sofia-001',
    pubkey: 'pk-sofia-notes',
    kind: 1,
    minutesAgo: 11,
    content:
      'The fastest way to make a social prototype feel fake is to leave every count at zero. Small asymmetries matter.',
    tags: [['liked-by', 'pk-jules-scope']],
    stats: { replies: 5, reposts: 11, likes: 244, bookmarks: 57, views: 12200 },
  },
  {
    id: 'note-theo-001',
    pubkey: 'pk-theo-epoch',
    kind: 1,
    minutesAgo: 18,
    content:
      'When people say a feed bug is random, it usually means two clocks disagreed and nobody wrote that down.',
    tags: [['liked-by', currentUser]],
    stats: { replies: 2, reposts: 16, likes: 138, bookmarks: 31, views: 7100 },
  },
  {
    id: 'note-remy-001',
    pubkey: 'pk-remy-scroll',
    kind: 1,
    minutesAgo: 27,
    content:
      'Strong timeline design is mostly restraint: one accent color, one primary action, one obvious path forward.',
    media: [
      {
        id: 'media-remy-001',
        url: mockPostMedia.launchDeck,
        alt: 'Mocked launch deck artwork',
        aspectRatio: 16 / 9,
        durationLabel: '0:48',
        eyebrow: 'LIVE NOW',
      },
    ],
    tags: [['liked-by', 'pk-priya-build']],
    stats: { replies: 3, reposts: 14, likes: 126, bookmarks: 24, views: 6650 },
  },
  {
    id: 'note-luca-001',
    pubkey: 'pk-luca-signal',
    kind: 1,
    minutesAgo: 39,
    content:
      'If your local state rehydrates slower than your optimism, users will teach you exactly where the seams are.',
    tags: [['liked-by', 'pk-omar-packets']],
    stats: { replies: 6, reposts: 9, likes: 102, bookmarks: 21, views: 5900 },
  },
  {
    id: 'note-mina-001',
    pubkey: 'pk-mina-threads',
    kind: 1,
    minutesAgo: 53,
    content:
      'Tiny interaction copy note: "Post" sounds final, "Reply" sounds conversational. That little shift changes how people write.',
    tags: [['liked-by', currentUser], ['liked-by', 'pk-sofia-notes']],
    stats: { replies: 9, reposts: 12, likes: 228, bookmarks: 49, views: 11100 },
  },
  {
    id: 'note-omar-001',
    pubkey: 'pk-omar-packets',
    kind: 1,
    minutesAgo: 66,
    content:
      'Storage bugs are narrative bugs. The app promised "I remember" and then forgot under pressure.',
    tags: [['liked-by', 'pk-luca-signal']],
    stats: { replies: 7, reposts: 10, likes: 164, bookmarks: 29, views: 7400 },
  },
  {
    id: 'note-jules-001',
    pubkey: 'pk-jules-scope',
    kind: 1,
    minutesAgo: 79,
    content:
      'Editorial instinct for product builders: if you need six badges to explain the state of a thing, the state model is doing too much.',
    tags: [['liked-by', 'pk-remy-scroll']],
    stats: { replies: 4, reposts: 8, likes: 97, bookmarks: 18, views: 5100 },
  },
  {
    id: 'note-priya-001',
    pubkey: 'pk-priya-build',
    kind: 1,
    minutesAgo: 92,
    content:
      'Mobile feed checklist:\n- thumb-safe action row\n- one clear composer path\n- tabs that can breathe without stealing focus',
    tags: [['liked-by', currentUser]],
    stats: { replies: 8, reposts: 17, likes: 211, bookmarks: 62, views: 13100 },
  },
  {
    id: 'note-nia-001',
    pubkey: 'pk-nia-relay',
    kind: 1,
    minutesAgo: 108,
    content:
      'A mocked relay can still teach you real product lessons, especially around timing, expectation, and visible recovery.',
    tags: [['liked-by', 'pk-theo-epoch']],
    stats: { replies: 2, reposts: 7, likes: 89, bookmarks: 16, views: 4300 },
  },
  {
    id: 'note-ada-002',
    pubkey: currentUser,
    kind: 1,
    minutesAgo: 123,
    content:
      'I want more interfaces that feel composed instead of decorated. Drama in product should come from motion and hierarchy, not garnish.',
    tags: [['liked-by', 'pk-sofia-notes']],
    stats: { replies: 3, reposts: 15, likes: 173, bookmarks: 44, views: 8000 },
  },
  {
    id: 'note-mina-002',
    pubkey: 'pk-mina-threads',
    kind: 1,
    minutesAgo: 154,
    content:
      'Profile tabs are sneaky hard. The user wants one page; the system wants four query layers. Good UI makes that fight invisible.',
    tags: [['liked-by', currentUser], ['liked-by', 'pk-jules-scope']],
    stats: { replies: 5, reposts: 13, likes: 201, bookmarks: 41, views: 9800 },
  },
  {
    id: 'note-sofia-002',
    pubkey: 'pk-sofia-notes',
    kind: 1,
    minutesAgo: 188,
    content:
      'Every great social feed has one reliable mood. The strongest prototypes decide that mood before they design a single icon.',
    media: [
      {
        id: 'media-sofia-002',
        url: mockPostMedia.designOps,
        alt: 'Mocked design operations artwork',
        aspectRatio: 16 / 9,
        eyebrow: 'DESIGN OPS',
      },
    ],
    tags: [['liked-by', 'pk-priya-build']],
    stats: { replies: 6, reposts: 22, likes: 336, bookmarks: 75, views: 16700 },
  },
  {
    id: 'note-remy-002',
    pubkey: 'pk-remy-scroll',
    kind: 1,
    minutesAgo: 221,
    content:
      'Load more is less about pagination and more about trust. If the wait feels intentional, users stay patient.',
    tags: [['liked-by', 'pk-mina-threads']],
    stats: { replies: 1, reposts: 5, likes: 66, bookmarks: 11, views: 3200 },
  },
  {
    id: 'note-theo-002',
    pubkey: 'pk-theo-epoch',
    kind: 1,
    minutesAgo: 260,
    content:
      'Group state is just social state with stricter consequences. That is why sloppy restore logic hurts twice as much.',
    tags: [['liked-by', currentUser], ['liked-by', 'pk-omar-packets']],
    stats: { replies: 6, reposts: 20, likes: 287, bookmarks: 59, views: 14900 },
  },
  {
    id: 'note-luca-002',
    pubkey: 'pk-luca-signal',
    kind: 1,
    minutesAgo: 304,
    content:
      'Benchmark tip: track the moment the UI is technically interactive and the moment it actually feels ready. Those are different events.',
    tags: [['liked-by', 'pk-remy-scroll']],
    stats: { replies: 4, reposts: 6, likes: 74, bookmarks: 15, views: 3600 },
  },
  {
    id: 'note-omar-002',
    pubkey: 'pk-omar-packets',
    kind: 1,
    minutesAgo: 343,
    content:
      'Persist the illusion, not every micro-state. Session, interactions, authored content: yes. Loading spinners: absolutely not.',
    tags: [['liked-by', currentUser]],
    stats: { replies: 3, reposts: 9, likes: 121, bookmarks: 28, views: 5400 },
  },
  {
    id: 'note-priya-002',
    pubkey: 'pk-priya-build',
    kind: 1,
    minutesAgo: 390,
    content:
      'A bottom nav can be icon-only and still feel generous if the rest of the screen is calm enough to carry it.',
    tags: [['liked-by', 'pk-sofia-notes']],
    stats: { replies: 2, reposts: 8, likes: 114, bookmarks: 22, views: 5700 },
  },
  {
    id: 'note-jules-002',
    pubkey: 'pk-jules-scope',
    kind: 1,
    minutesAgo: 451,
    content:
      'The best prototypes read like an argument with taste: a dozen tiny decisions, all pointing in the same direction.',
    tags: [['liked-by', currentUser]],
    stats: { replies: 5, reposts: 7, likes: 109, bookmarks: 19, views: 4700 },
  },
  {
    id: 'note-sofia-003',
    pubkey: 'pk-sofia-notes',
    kind: 1,
    minutesAgo: 530,
    content:
      'Still believe the timeline is one of the purest product exercises: information density, rhythm, memory, personality.',
    tags: [['liked-by', 'pk-jules-scope']],
    stats: { replies: 9, reposts: 18, likes: 292, bookmarks: 66, views: 13900 },
  },
  {
    id: 'note-ada-003',
    pubkey: currentUser,
    kind: 1,
    minutesAgo: 612,
    content:
      'If the prototype cannot survive a hard refresh and still feel coherent, it has not earned the word "product" yet.',
    tags: [['liked-by', 'pk-nia-relay']],
    stats: { replies: 7, reposts: 26, likes: 351, bookmarks: 81, views: 19000 },
  },
  {
    id: 'note-nia-002',
    pubkey: 'pk-nia-relay',
    kind: 1,
    minutesAgo: 701,
    content:
      'Observed a team debugging by adding more loading indicators. The actual fix was letting one restore pass finish before the next began.',
    media: [
      {
        id: 'media-nia-002',
        url: mockPostMedia.fieldNotes,
        alt: 'Mocked field notes artwork',
        aspectRatio: 16 / 9,
        eyebrow: 'FIELD NOTES',
      },
    ],
    tags: [['liked-by', currentUser]],
    stats: { replies: 3, reposts: 12, likes: 147, bookmarks: 26, views: 6500 },
  },
  {
    id: 'note-mina-003',
    pubkey: 'pk-mina-threads',
    kind: 1,
    minutesAgo: 816,
    content:
      'Wrote this down for future me: optimistic UI should feel brave, not reckless. The rollback path matters.',
    tags: [['liked-by', 'pk-priya-build']],
    stats: { replies: 4, reposts: 9, likes: 132, bookmarks: 24, views: 6000 },
  },
  {
    id: 'note-remy-003',
    pubkey: 'pk-remy-scroll',
    kind: 1,
    minutesAgo: 930,
    content:
      'Motion is narrative. Even one subtle fade-in can tell the user "the app understood what you just did."',
    tags: [['liked-by', currentUser]],
    stats: { replies: 2, reposts: 11, likes: 141, bookmarks: 27, views: 6100 },
  },
  {
    id: 'note-luca-003',
    pubkey: 'pk-luca-signal',
    kind: 1,
    minutesAgo: 1050,
    content:
      'Mocked data becomes convincing the moment one profile has enough history to imply a real calendar behind it.',
    tags: [['liked-by', 'pk-mina-threads']],
    stats: { replies: 2, reposts: 5, likes: 72, bookmarks: 10, views: 3300 },
  },
  {
    id: 'note-theo-003',
    pubkey: 'pk-theo-epoch',
    kind: 1,
    minutesAgo: 1175,
    content:
      'Protocol people will always underestimate how much trust the UI can add or remove from the exact same underlying event model.',
    tags: [['liked-by', 'pk-jules-scope']],
    stats: { replies: 6, reposts: 15, likes: 222, bookmarks: 45, views: 10300 },
  },
  {
    id: 'note-priya-003',
    pubkey: 'pk-priya-build',
    kind: 1,
    minutesAgo: 1304,
    content:
      'The ideal composer height is whatever lets a two-line thought feel welcome without making the rest of the feed scroll away.',
    tags: [['liked-by', currentUser], ['liked-by', 'pk-remy-scroll']],
    stats: { replies: 5, reposts: 9, likes: 158, bookmarks: 30, views: 6900 },
  },
  {
    id: 'note-jules-003',
    pubkey: 'pk-jules-scope',
    kind: 1,
    minutesAgo: 1460,
    content:
      'I love when a product chooses a narrow scope and then goes all-in on making that scope unmistakably cared for.',
    tags: [['liked-by', 'pk-sofia-notes']],
    stats: { replies: 3, reposts: 7, likes: 117, bookmarks: 21, views: 4900 },
  },
  {
    id: 'note-omar-003',
    pubkey: 'pk-omar-packets',
    kind: 1,
    minutesAgo: 1600,
    content:
      'There are only two kinds of caches: the ones you can explain on a whiteboard and the ones that will humble you in production.',
    tags: [['liked-by', currentUser]],
    stats: { replies: 4, reposts: 10, likes: 129, bookmarks: 23, views: 5600 },
  },
  {
    id: 'note-sofia-004',
    pubkey: 'pk-sofia-notes',
    kind: 1,
    minutesAgo: 1770,
    content:
      'Social products age in public. That is why visual confidence and state consistency compound faster than clever gimmicks.',
    tags: [['liked-by', 'pk-nia-relay']],
    stats: { replies: 7, reposts: 19, likes: 263, bookmarks: 54, views: 12000 },
  },
  {
    id: 'note-ada-004',
    pubkey: currentUser,
    kind: 1,
    minutesAgo: 1930,
    content:
      'Current rule of thumb: if a prototype can survive mobile, refresh, and a slightly flaky network story, it is ready to be judged honestly.',
    tags: [['liked-by', 'pk-priya-build']],
    stats: { replies: 8, reposts: 24, likes: 319, bookmarks: 74, views: 17300 },
  },
  {
    id: 'note-nia-003',
    pubkey: 'pk-nia-relay',
    kind: 1,
    minutesAgo: 2100,
    content:
      'Resilience is a product feature. Users do not care whether the cause was a relay, a cache, or your least favorite watcher.',
    tags: [['liked-by', 'pk-theo-epoch']],
    stats: { replies: 5, reposts: 13, likes: 181, bookmarks: 34, views: 7700 },
  },
];

const replySeeds: NoteSeed[] = [
  {
    id: 'reply-mina-001',
    pubkey: 'pk-mina-threads',
    kind: 1,
    minutesAgo: 4,
    content:
      'Exactly. The strongest feeds feel edited even when they are obviously alive.',
    replyTo: 'note-ada-001',
    rootId: 'note-ada-001',
    tags: [],
    stats: { replies: 1, reposts: 0, likes: 18, bookmarks: 4, views: 480 },
  },
  {
    id: 'reply-priya-001',
    pubkey: 'pk-priya-build',
    kind: 1,
    minutesAgo: 3,
    content:
      'And that calm is harder on mobile, because every bad spacing decision gets amplified.',
    replyTo: 'reply-mina-001',
    rootId: 'note-ada-001',
    tags: [],
    stats: { replies: 0, reposts: 0, likes: 10, bookmarks: 1, views: 290 },
  },
  {
    id: 'reply-ada-001',
    pubkey: currentUser,
    kind: 1,
    minutesAgo: 248,
    content:
      'The social part is what makes restore bugs feel personal. People read inconsistency as betrayal.',
    replyTo: 'note-theo-002',
    rootId: 'note-theo-002',
    tags: [],
    stats: { replies: 0, reposts: 1, likes: 36, bookmarks: 8, views: 760 },
  },
  {
    id: 'reply-omar-001',
    pubkey: 'pk-omar-packets',
    kind: 1,
    minutesAgo: 245,
    content:
      'That is such a good way to frame it. The failure is technical; the damage is emotional.',
    replyTo: 'note-theo-002',
    rootId: 'note-theo-002',
    tags: [],
    stats: { replies: 0, reposts: 0, likes: 24, bookmarks: 3, views: 530 },
  },
  {
    id: 'reply-sofia-001',
    pubkey: 'pk-sofia-notes',
    kind: 1,
    minutesAgo: 149,
    content:
      'Tabs are editorial devices in disguise. They tell people what kinds of history matter.',
    replyTo: 'note-mina-002',
    rootId: 'note-mina-002',
    tags: [],
    stats: { replies: 0, reposts: 0, likes: 27, bookmarks: 6, views: 580 },
  },
  {
    id: 'reply-luca-001',
    pubkey: 'pk-luca-signal',
    kind: 1,
    minutesAgo: 343,
    content:
      'Yes, and the difference is often hidden behind the exact same screen looking technically loaded.',
    replyTo: 'note-luca-002',
    rootId: 'note-luca-002',
    tags: [],
    stats: { replies: 0, reposts: 0, likes: 12, bookmarks: 2, views: 260 },
  },
  {
    id: 'reply-remy-001',
    pubkey: 'pk-remy-scroll',
    kind: 1,
    minutesAgo: 121,
    content:
      'Composed instead of decorated is going straight into my next design review.',
    replyTo: 'note-ada-002',
    rootId: 'note-ada-002',
    tags: [],
    stats: { replies: 0, reposts: 0, likes: 19, bookmarks: 2, views: 330 },
  },
  {
    id: 'reply-nia-001',
    pubkey: 'pk-nia-relay',
    kind: 1,
    minutesAgo: 699,
    content:
      'The trick is making the recovery legible without turning the interface into a cockpit.',
    replyTo: 'note-nia-002',
    rootId: 'note-nia-002',
    tags: [],
    stats: { replies: 0, reposts: 0, likes: 22, bookmarks: 4, views: 410 },
  },
  {
    id: 'reply-jules-001',
    pubkey: 'pk-jules-scope',
    kind: 1,
    minutesAgo: 815,
    content:
      'Optimism with a rollback path might be the best one-line product philosophy I have heard all month.',
    replyTo: 'note-mina-003',
    rootId: 'note-mina-003',
    tags: [],
    stats: { replies: 0, reposts: 0, likes: 21, bookmarks: 3, views: 370 },
  },
  {
    id: 'reply-priya-002',
    pubkey: 'pk-priya-build',
    kind: 1,
    minutesAgo: 1040,
    content:
      'Exactly why a strong mocked dataset matters. Users spot fake emptiness instantly.',
    replyTo: 'note-luca-003',
    rootId: 'note-luca-003',
    tags: [],
    stats: { replies: 0, reposts: 0, likes: 17, bookmarks: 2, views: 310 },
  },
];

const repostSeeds: NoteSeed[] = [
  {
    id: 'repost-jules-001',
    pubkey: 'pk-jules-scope',
    kind: 6,
    minutesAgo: 9,
    content: '',
    repostOf: 'note-theo-001',
    tags: [['e', 'note-theo-001']],
    stats: { replies: 0, reposts: 0, likes: 0, bookmarks: 0 },
  },
  {
    id: 'repost-remy-001',
    pubkey: 'pk-remy-scroll',
    kind: 6,
    minutesAgo: 70,
    content: '',
    repostOf: 'note-priya-001',
    tags: [['e', 'note-priya-001']],
    stats: { replies: 0, reposts: 0, likes: 0, bookmarks: 0 },
  },
  {
    id: 'repost-sofia-001',
    pubkey: 'pk-sofia-notes',
    kind: 6,
    minutesAgo: 232,
    content: '',
    repostOf: 'note-ada-002',
    tags: [['e', 'note-ada-002']],
    stats: { replies: 0, reposts: 0, likes: 0, bookmarks: 0 },
  },
  {
    id: 'repost-nia-001',
    pubkey: 'pk-nia-relay',
    kind: 6,
    minutesAgo: 612,
    content: '',
    repostOf: 'note-sofia-003',
    tags: [['e', 'note-sofia-003']],
    stats: { replies: 0, reposts: 0, likes: 0, bookmarks: 0 },
  },
  {
    id: 'repost-ada-001',
    pubkey: currentUser,
    kind: 6,
    minutesAgo: 1260,
    content: '',
    repostOf: 'note-sofia-002',
    tags: [['e', 'note-sofia-002']],
    stats: { replies: 0, reposts: 0, likes: 0, bookmarks: 0 },
  },
];

export const mockNotes: NostrNote[] = [...topLevelSeeds, ...replySeeds, ...repostSeeds].map(note);

export const initialViewerState: Record<string, ViewerPostState> = {
  'note-sofia-001': { liked: true, reposted: false, bookmarked: true },
  'note-theo-001': { liked: true, reposted: false, bookmarked: false },
  'note-mina-001': { liked: true, reposted: false, bookmarked: true },
  'note-priya-001': { liked: true, reposted: true, bookmarked: true },
  'note-ada-002': { liked: false, reposted: false, bookmarked: true },
  'note-mina-002': { liked: true, reposted: false, bookmarked: true },
  'note-theo-002': { liked: true, reposted: true, bookmarked: true },
  'note-omar-002': { liked: true, reposted: false, bookmarked: false },
  'note-jules-002': { liked: true, reposted: false, bookmarked: false },
  'note-remy-003': { liked: true, reposted: true, bookmarked: true },
  'note-priya-003': { liked: true, reposted: false, bookmarked: true },
  'note-omar-003': { liked: true, reposted: false, bookmarked: false },
};

export const initialHomeVisibleCount = 15;

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function remapCurrentUserPubkey(
  notes: NostrNote[],
  currentUserPubkey: string,
): NostrNote[] {
  if (currentUserPubkey === CURRENT_USER_PUBKEY) {
    return notes;
  }

  return notes.map((entry) => ({
    ...entry,
    pubkey: entry.pubkey === CURRENT_USER_PUBKEY ? currentUserPubkey : entry.pubkey,
    tags: entry.tags.map((tag) =>
      tag.map((value, index) =>
        index === 1 && value === CURRENT_USER_PUBKEY ? currentUserPubkey : value,
      ),
    ),
  }));
}

export function createInitialFeedState(currentUserPubkey = CURRENT_USER_PUBKEY): FeedPersistenceState {
  return cloneState({
    notes: remapCurrentUserPubkey(mockNotes, currentUserPubkey),
    viewerState: initialViewerState,
    homeVisibleCount: initialHomeVisibleCount,
  });
}
