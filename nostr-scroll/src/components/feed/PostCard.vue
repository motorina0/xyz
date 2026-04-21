<template>
  <article
    class="post-card scroll-divider"
    :class="{ 'post-card--highlighted': highlighted }"
    @click="openPost"
  >
    <div v-if="repostedBy" class="post-card__repost text-scroll-soft">
      <q-icon name="repeat" size="16px" />
      <span>{{ repostedBy.displayName }} reposted</span>
    </div>

    <div class="post-card__content">
      <button class="post-card__avatar" type="button" @click.stop="openProfile(displayPost.pubkey)">
        <q-avatar size="42px">
          <img :src="author?.picture" :alt="author?.displayName ?? displayPost.pubkey" />
        </q-avatar>
      </button>

      <div class="post-card__body">
        <div class="post-card__header">
          <div class="post-card__header-main">
            <button class="post-card__identity" type="button" @click.stop="openProfile(displayPost.pubkey)">
              <span class="post-card__display-name">{{ author?.displayName ?? 'Unknown profile' }}</span>
              <q-icon
                v-if="author?.verified"
                name="verified"
                size="18px"
                class="post-card__verified"
              />
              <span class="text-scroll-muted">@{{ author?.name ?? 'unknown' }}</span>
            </button>
            <span class="text-scroll-muted">·</span>
            <span class="text-scroll-muted">{{ formatRelativeTime(displayPost.createdAt) }}</span>
          </div>
          <q-btn flat round dense icon="more_horiz" class="post-card__menu" @click.stop />
        </div>

        <div v-if="replyingToHandle" class="post-card__replying text-scroll-muted">
          Replying to <span>@{{ replyingToHandle }}</span>
        </div>

        <div class="post-card__text">{{ renderedContent }}</div>
        <button
          v-if="showMoreLink"
          type="button"
          class="post-card__show-more"
          @click.stop="expandPost"
        >
          Show more
        </button>

        <button
          v-if="quotedPost"
          class="post-card__quoted"
          type="button"
          @click.stop="openPostById(quotedPost.id)"
        >
          <div class="post-card__quoted-header">
            <span class="post-card__display-name">{{ quotedAuthor?.displayName ?? 'Unknown profile' }}</span>
            <q-icon
              v-if="quotedAuthor?.verified"
              name="verified"
              size="16px"
              class="post-card__verified"
            />
            <span class="text-scroll-muted">@{{ quotedAuthor?.name ?? 'unknown' }}</span>
          </div>
          <div class="post-card__quoted-text">{{ quotedPost.content }}</div>
        </button>

        <div
          v-if="primaryMedia"
          class="post-card__media"
          :style="{ aspectRatio: `${primaryMedia.aspectRatio}` }"
        >
          <img :src="primaryMedia.url" :alt="primaryMedia.alt" />
          <span v-if="primaryMedia.eyebrow" class="post-card__media-eyebrow">{{ primaryMedia.eyebrow }}</span>
          <span v-if="primaryMedia.durationLabel" class="post-card__media-duration">
            {{ primaryMedia.durationLabel }}
          </span>
        </div>

        <PostActionBar
          :post="displayPost"
          :state="postState"
          :pending="isPending"
          @reply="openPost"
          @repost="void feedStore.toggleRepost(displayPost.id)"
          @like="void feedStore.toggleLike(displayPost.id)"
          @bookmark="void feedStore.toggleBookmark(displayPost.id)"
          @share="void sharePost()"
        />
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { copyToClipboard } from 'quasar';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useFormatters } from '../../composables/useFormatters';
import { useFeedStore } from '../../stores/feed';
import { useProfilesStore } from '../../stores/profiles';
import type { NostrNote } from '../../types/nostr';
import PostActionBar from './PostActionBar.vue';

interface Props {
  post: NostrNote;
  highlighted?: boolean;
  previewChars?: number | null;
}

const props = withDefaults(defineProps<Props>(), {
  highlighted: false,
  previewChars: null,
});

const router = useRouter();
const feedStore = useFeedStore();
const profilesStore = useProfilesStore();
const { formatRelativeTime } = useFormatters();

const displayPost = computed(() => feedStore.resolveDisplayPost(props.post));
const author = computed(() => profilesStore.getProfileByPubkey(displayPost.value.pubkey));
const repostedBy = computed(() =>
  props.post.kind === 6 ? profilesStore.getProfileByPubkey(props.post.pubkey) : null,
);
const replyingToHandle = computed(() => {
  const parentId = displayPost.value.replyTo;
  if (!parentId) {
    return '';
  }

  const parent = feedStore.getPostById(parentId);
  if (!parent) {
    return '';
  }

  return profilesStore.getProfileByPubkey(parent.pubkey)?.name ?? '';
});
const quotedPost = computed(() => {
  if (!displayPost.value.quotedNoteId) {
    return null;
  }

  return feedStore.getPostById(displayPost.value.quotedNoteId);
});
const quotedAuthor = computed(() =>
  quotedPost.value ? profilesStore.getProfileByPubkey(quotedPost.value.pubkey) : null,
);
const primaryMedia = computed(() => displayPost.value.media?.[0] ?? null);
const postState = computed(() => feedStore.getViewerPostState(displayPost.value.id));
const isPending = computed(() => feedStore.isActionPending(displayPost.value.id));
const isExpanded = ref(false);
const contentCharacters = computed(() => Array.from(displayPost.value.content));
const previewCharacterLimit = computed(() =>
  typeof props.previewChars === 'number' && props.previewChars > 0 ? props.previewChars : null,
);
const showMoreLink = computed(
  () =>
    !isExpanded.value
    && previewCharacterLimit.value !== null
    && contentCharacters.value.length > previewCharacterLimit.value,
);
const renderedContent = computed(() => {
  if (isExpanded.value || previewCharacterLimit.value === null || contentCharacters.value.length <= previewCharacterLimit.value) {
    return displayPost.value.content;
  }

  return `${contentCharacters.value
    .slice(0, previewCharacterLimit.value)
    .join('')
    .trimEnd()}…`;
});

function openPost(): void {
  openPostById(displayPost.value.id);
}

function expandPost(): void {
  isExpanded.value = true;
}

function openPostById(id: string): void {
  void router.push({
    name: 'post-detail',
    params: { id },
  });
}

function openProfile(pubkey: string): void {
  void router.push({
    name: 'profile',
    params: { pubkey },
  });
}

async function sharePost(): Promise<void> {
  await copyToClipboard(displayPost.value.permalink);
}
</script>

<style scoped>
.post-card {
  padding: 12px 16px 8px;
  cursor: pointer;
  transition: background 150ms ease;
}

.post-card:hover {
  background: rgba(255, 255, 255, 0.015);
}

.post-card--highlighted {
  background: rgba(255, 255, 255, 0.03);
}

.post-card__repost {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.83rem;
  font-weight: 700;
  margin-bottom: 8px;
  padding-left: 54px;
}

.post-card__content {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.post-card__avatar,
.post-card__identity {
  background: transparent;
  border: none;
  color: inherit;
  padding: 0;
  cursor: pointer;
}

.post-card__body {
  flex: 1;
  min-width: 0;
}

.post-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 2px;
}

.post-card__header-main {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex-wrap: wrap;
}

.post-card__identity {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.post-card__display-name {
  font-weight: 800;
}

.post-card__verified {
  color: var(--scroll-accent);
}

.post-card__menu {
  color: var(--scroll-text-muted);
}

.post-card__replying {
  font-size: 0.9rem;
  margin-bottom: 4px;
}

.post-card__replying span {
  color: var(--scroll-accent);
}

.post-card__text {
  color: var(--scroll-text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.48;
  font-size: 0.98rem;
  max-width: 100%;
}

.post-card__show-more {
  margin-top: 2px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--scroll-accent);
  font: inherit;
  font-weight: 600;
  line-height: 1.3;
  cursor: pointer;
}

.post-card__show-more:hover {
  text-decoration: underline;
}

.post-card__quoted {
  width: 100%;
  margin-top: 12px;
  padding: 12px 14px;
  border: 1px solid var(--scroll-border);
  border-radius: 16px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.post-card__quoted:hover {
  background: rgba(255, 255, 255, 0.02);
}

.post-card__quoted-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.post-card__quoted-text {
  color: var(--scroll-text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  word-break: break-word;
  max-width: 100%;
}

.post-card__media {
  position: relative;
  width: 100%;
  overflow: hidden;
  margin-top: 12px;
  border: 1px solid var(--scroll-border);
  border-radius: 18px;
  background: var(--scroll-surface);
}

.post-card__media img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.post-card__media-eyebrow,
.post-card__media-duration {
  position: absolute;
  z-index: 1;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.72);
  color: white;
  font-size: 0.78rem;
  font-weight: 700;
}

.post-card__media-eyebrow {
  top: 12px;
  left: 12px;
  padding: 6px 10px;
}

.post-card__media-duration {
  right: 12px;
  bottom: 12px;
  padding: 5px 9px;
}
</style>
