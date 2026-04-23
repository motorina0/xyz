import type { NewsItem } from '../types/news';

export const newsItems: NewsItem[] = [
  {
    id: 'news-1',
    category: 'Protocol',
    headline: 'Local-first social apps keep moving more state to the edge.',
    source: 'Scroll Wire',
    timeLabel: '2h ago',
  },
  {
    id: 'news-2',
    category: 'Design',
    headline: 'Dense dark interfaces are back, but the best ones still breathe.',
    source: 'Signal Desk',
    timeLabel: '4h ago',
  },
  {
    id: 'news-3',
    category: 'Mobile',
    headline: 'Bottom-nav social flows now outperform side-drawer patterns in new prototypes.',
    source: 'Phone Brief',
    timeLabel: '6h ago',
  },
  {
    id: 'news-4',
    category: 'Builders',
    headline: 'Product teams are shipping faster experiments with fewer dead ends.',
    source: 'Proto Daily',
    timeLabel: '8h ago',
  },
  {
    id: 'news-5',
    category: 'Infra',
    headline: 'Teams are spending more time on session restore after real-world CI races surface.',
    source: 'Infra Journal',
    timeLabel: '10h ago',
  },
  {
    id: 'news-6',
    category: 'Community',
    headline:
      'Smaller social clients are winning loyalty by feeling more intentional than giant networks.',
    source: 'Today in Nostr',
    timeLabel: '12h ago',
  },
];
