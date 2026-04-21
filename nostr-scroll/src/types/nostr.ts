export interface NostrProfile {
  pubkey: string;
  npub: string;
  nprofile?: string;
  name: string;
  displayName: string;
  verified?: boolean;
  about: string;
  picture: string;
  banner: string;
  nip05?: string;
  website?: string;
  lud16?: string;
  followersCount?: number;
  followingCount?: number;
  joinedAt?: string;
  location?: string;
}

export interface NostrNoteMedia {
  id: string;
  url: string;
  alt: string;
  aspectRatio: number;
  durationLabel?: string;
  eyebrow?: string;
}

export interface NostrNote {
  id: string;
  pubkey: string;
  kind: 1 | 6;
  createdAt: string;
  content: string;
  media?: NostrNoteMedia[];
  tags: string[][];
  replyTo?: string | null;
  rootId?: string | null;
  repostOf?: string | null;
  quotedNoteId?: string | null;
  entity: string;
  permalink: string;
  stats: {
    replies: number;
    reposts: number;
    likes: number;
    bookmarks: number;
    views?: number;
  };
}

export interface ViewerPostState {
  liked: boolean;
  reposted: boolean;
  bookmarked: boolean;
  likeEventIds?: string[];
  repostEventIds?: string[];
}

export type HomeTimelineTab = 'all' | 'following';
export type ProfileTab = 'posts' | 'replies' | 'likes' | 'reposts';
