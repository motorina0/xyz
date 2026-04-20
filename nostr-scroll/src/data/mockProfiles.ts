import type { NostrProfile } from '../types/nostr';
import { createAvatarDataUri, createBannerDataUri } from './mockMedia';

export const CURRENT_USER_PUBKEY = 'pk-ada-rivera';

function profile(
  profileData: Omit<NostrProfile, 'picture' | 'banner'> & {
    initials: string;
    avatarColors: [string, string];
    bannerColors: [string, string, string];
  },
): NostrProfile {
  return {
    ...profileData,
    picture: createAvatarDataUri(
      profileData.initials,
      profileData.avatarColors[0],
      profileData.avatarColors[1],
    ),
    banner: createBannerDataUri(
      profileData.displayName,
      profileData.bannerColors[0],
      profileData.bannerColors[1],
      profileData.bannerColors[2],
    ),
  };
}

const currentUserTemplate = {
  name: 'ada',
  displayName: 'Ada Rivera',
  verified: true,
  about:
    'Designing fast, humane Nostr products with a bias toward clear systems and sharp interfaces.',
  initials: 'AR',
  avatarColors: ['#1d9bf0', '#075985'] as [string, string],
  bannerColors: ['#0b1220', '#162234', '#1d9bf0'] as [string, string, string],
  nip05: 'ada@nostr-scroll.local',
  website: 'nostr-scroll.local/ada',
  lud16: 'ada@scrollpay.local',
  followersCount: 12840,
  followingCount: 428,
  joinedAt: '2022-03-18T00:00:00.000Z',
  location: 'Barcelona, ES',
};

function deriveSessionProfileName(pubkey: string): string {
  return `nostr${pubkey.slice(0, 6)}`;
}

function deriveSessionProfileDisplayName(pubkey: string): string {
  return `Nostr ${pubkey.slice(0, 8)}`;
}

function deriveSessionProfileInitials(pubkey: string): string {
  return pubkey.slice(0, 2).toUpperCase();
}

function createCurrentUserProfile(pubkey: string): NostrProfile {
  if (pubkey === CURRENT_USER_PUBKEY) {
    return profile({
      pubkey,
      ...currentUserTemplate,
    });
  }

  const displayName = deriveSessionProfileDisplayName(pubkey);

  return profile({
    pubkey,
    name: deriveSessionProfileName(pubkey),
    displayName,
    verified: true,
    about: currentUserTemplate.about,
    initials: deriveSessionProfileInitials(pubkey),
    avatarColors: currentUserTemplate.avatarColors,
    bannerColors: currentUserTemplate.bannerColors,
    followersCount: currentUserTemplate.followersCount,
    followingCount: currentUserTemplate.followingCount,
    joinedAt: currentUserTemplate.joinedAt,
    location: currentUserTemplate.location,
  });
}

const otherProfiles: NostrProfile[] = [
  profile({
    pubkey: 'pk-nia-relay',
    name: 'niarelay',
    displayName: 'Nia Relay',
    verified: true,
    about:
      'Observing how information moves when you remove friction, then putting the right friction back.',
    initials: 'NR',
    avatarColors: ['#fb7185', '#be123c'],
    bannerColors: ['#1a0f19', '#31112f', '#fb7185'],
    nip05: 'nia@relayfield.local',
    website: 'relayfield.local',
    followersCount: 8450,
    followingCount: 302,
    joinedAt: '2021-09-08T00:00:00.000Z',
    location: 'Lisbon, PT',
  }),
  profile({
    pubkey: 'pk-theo-epoch',
    name: 'theoepoch',
    displayName: 'Theo Epoch',
    verified: true,
    about:
      'Group coordination, state rotation, and protocol edges that only appear once the room gets busy.',
    initials: 'TE',
    avatarColors: ['#a78bfa', '#4f46e5'],
    bannerColors: ['#0f1022', '#161a34', '#7c3aed'],
    nip05: 'theo@epoch.zone',
    followersCount: 11120,
    followingCount: 580,
    joinedAt: '2020-12-11T00:00:00.000Z',
    location: 'Berlin, DE',
  }),
  profile({
    pubkey: 'pk-mina-threads',
    name: 'minathreads',
    displayName: 'Mina Threads',
    verified: true,
    about:
      'Thread writer. Product operator. Slightly obsessed with small interaction details that make a feed feel alive.',
    initials: 'MT',
    avatarColors: ['#10b981', '#047857'],
    bannerColors: ['#061814', '#0b2d27', '#10b981'],
    website: 'minathreads.dev',
    followersCount: 9560,
    followingCount: 768,
    joinedAt: '2021-02-02T00:00:00.000Z',
    location: 'Amsterdam, NL',
  }),
  profile({
    pubkey: 'pk-jules-scope',
    name: 'julesscope',
    displayName: 'Jules Scope',
    about:
      'Editor for technical stories, interested in what happens when protocol thinking meets mainstream product polish.',
    initials: 'JS',
    avatarColors: ['#f59e0b', '#b45309'],
    bannerColors: ['#211205', '#382008', '#f59e0b'],
    followersCount: 6120,
    followingCount: 450,
    joinedAt: '2022-06-30T00:00:00.000Z',
    location: 'London, UK',
  }),
  profile({
    pubkey: 'pk-priya-build',
    name: 'priyabuild',
    displayName: 'Priya Build',
    verified: true,
    about:
      'Shipping frontends that still feel thoughtful under load. Building for mobile first, then making desktop sing.',
    initials: 'PB',
    avatarColors: ['#38bdf8', '#0f766e'],
    bannerColors: ['#07151c', '#112833', '#38bdf8'],
    followersCount: 7080,
    followingCount: 521,
    joinedAt: '2023-01-14T00:00:00.000Z',
    location: 'Bucharest, RO',
  }),
  profile({
    pubkey: 'pk-omar-packets',
    name: 'omarpackets',
    displayName: 'Omar Packets',
    about:
      'Latency, local-first data, and why storage bugs are almost always storytelling bugs in disguise.',
    initials: 'OP',
    avatarColors: ['#22c55e', '#166534'],
    bannerColors: ['#07140b', '#0f2316', '#22c55e'],
    followersCount: 5340,
    followingCount: 392,
    joinedAt: '2022-08-09T00:00:00.000Z',
    location: 'Cairo, EG',
  }),
  profile({
    pubkey: 'pk-sofia-notes',
    name: 'sofianotes',
    displayName: 'Sofia Notes',
    verified: true,
    about:
      'Writing about social UX, creator tools, and the difference between loud design and memorable design.',
    initials: 'SN',
    avatarColors: ['#f97316', '#c2410c'],
    bannerColors: ['#200d06', '#351408', '#f97316'],
    followersCount: 13220,
    followingCount: 630,
    joinedAt: '2019-11-20T00:00:00.000Z',
    location: 'Madrid, ES',
  }),
  profile({
    pubkey: 'pk-luca-signal',
    name: 'lucasignal',
    displayName: 'Luca Signal',
    about:
      'Quietly benchmarking everything. If a feature feels smooth, I probably measured it three times before breakfast.',
    initials: 'LS',
    avatarColors: ['#e879f9', '#9333ea'],
    bannerColors: ['#170917', '#291130', '#e879f9'],
    followersCount: 4880,
    followingCount: 340,
    joinedAt: '2023-04-22T00:00:00.000Z',
    location: 'Milan, IT',
  }),
  profile({
    pubkey: 'pk-remy-scroll',
    name: 'remyscroll',
    displayName: 'Remy Scroll',
    about:
      'Turning rough product instincts into polished movement. Feeds, ranking, and timeline behavior.',
    initials: 'RS',
    avatarColors: ['#60a5fa', '#1d4ed8'],
    bannerColors: ['#08111c', '#132136', '#60a5fa'],
    followersCount: 7420,
    followingCount: 601,
    joinedAt: '2022-11-05T00:00:00.000Z',
    location: 'Toronto, CA',
  }),
];

export function createInitialProfiles(currentUserPubkey = CURRENT_USER_PUBKEY): NostrProfile[] {
  return [createCurrentUserProfile(currentUserPubkey), ...otherProfiles];
}

export const mockProfiles: NostrProfile[] = createInitialProfiles();
