<template>
  <div class="right-news-panel">
    <label class="right-news-panel__search">
      <q-icon name="search" size="18px" />
      <input type="text" placeholder="Search" />
    </label>

    <div class="scroll-card right-panel-card promo-card">
      <div class="promo-card__header">Buy nostr.com identifier</div>
      <div class="promo-card__copy text-scroll-muted">
        Claim a short, memorable nostr.com handle and make your profile easier to find and share.
      </div>
      <q-btn no-caps unelevated label="Buy Now" class="scroll-button promo-card__button" />
    </div>

    <div class="scroll-card right-panel-card news-card">
      <div class="card-heading card-heading--split">
        <span>Today's News</span>
        <q-btn flat round dense icon="close" class="card-heading__action" />
      </div>

      <div v-if="newsItems.length" class="news-list">
        <div v-for="item in newsItems.slice(0, 4)" :key="item.id" class="news-item">
          <div class="news-item__category">{{ item.category }}</div>
          <div class="news-item__headline">{{ item.headline }}</div>
          <div class="news-item__meta text-scroll-muted">
            {{ item.timeLabel }} · News · {{ item.source }}
          </div>
        </div>
      </div>

      <div v-else class="news-loading text-scroll-muted">Loading headlines…</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { loadNews } from '../../services/newsService';
import type { NewsItem } from '../../types/news';

const newsItems = ref<NewsItem[]>([]);

onMounted(async () => {
  newsItems.value = await loadNews();
});
</script>

<style scoped>
.right-news-panel {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 8px;
}

.right-news-panel__search {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid var(--scroll-border);
  border-radius: 999px;
  background: var(--scroll-bg);
  color: var(--scroll-text-muted);
}

.right-news-panel__search:focus-within {
  border-color: var(--scroll-accent);
  color: var(--scroll-accent);
}

.right-news-panel__search input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--scroll-text);
  font-size: 0.96rem;
  outline: none;
}

.right-panel-card {
  overflow: hidden;
}

.card-heading {
  padding: 16px 16px 10px;
  font-size: 1.28rem;
  font-weight: 800;
}

.card-heading--split {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-heading__action {
  color: var(--scroll-text-muted);
}

.promo-card {
  padding: 18px 16px 16px;
}

.promo-card__header {
  font-size: 1.28rem;
  font-weight: 800;
  margin-bottom: 8px;
}

.promo-card__copy {
  line-height: 1.45;
  margin-bottom: 14px;
}

.promo-card__button {
  min-height: 36px;
  padding: 0 18px;
  background: var(--scroll-accent);
  color: white;
}

.news-list {
  display: flex;
  flex-direction: column;
}

.news-item {
  padding: 14px 16px;
  border-top: 1px solid var(--scroll-border);
  transition: background 160ms ease;
}

.news-item:hover {
  background: var(--scroll-hover);
}

.news-item__category {
  color: var(--scroll-text-soft);
  font-size: 0.82rem;
}

.news-item__headline {
  font-size: 0.98rem;
  line-height: 1.35;
  font-weight: 700;
  margin: 3px 0 6px;
}

.news-loading {
  padding: 16px;
}
</style>
