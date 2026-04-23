import { newsItems } from '../data/news';
import type { NewsItem } from '../types/news';

export async function loadNews(): Promise<NewsItem[]> {
  return JSON.parse(JSON.stringify(newsItems)) as NewsItem[];
}
