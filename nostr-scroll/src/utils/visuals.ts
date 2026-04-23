function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toDataUri(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function hashSeed(seed: string): number {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 360;
  }

  return hash;
}

function deriveInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return 'NS';
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function createFallbackAvatarDataUri(label: string, seed: string): string {
  const hue = hashSeed(seed);
  const initials = escapeSvgText(deriveInitials(label));
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
      <defs>
        <linearGradient id="avatarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="hsl(${hue} 78% 58%)" />
          <stop offset="100%" stop-color="hsl(${(hue + 44) % 360} 68% 36%)" />
        </linearGradient>
      </defs>
      <rect width="240" height="240" rx="120" fill="url(#avatarGradient)" />
      <text
        x="120"
        y="132"
        text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif"
        font-size="84"
        font-weight="700"
        fill="#ffffff"
      >
        ${initials}
      </text>
    </svg>
  `;

  return toDataUri(svg);
}

export function createFallbackBannerDataUri(label: string, seed: string): string {
  const hue = hashSeed(seed);
  const safeLabel = escapeSvgText(label.trim() || 'Nostr');
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1500" height="500" viewBox="0 0 1500 500">
      <defs>
        <linearGradient id="bannerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="hsl(${hue} 72% 14%)" />
          <stop offset="52%" stop-color="hsl(${(hue + 24) % 360} 58% 22%)" />
          <stop offset="100%" stop-color="hsl(${(hue + 62) % 360} 86% 48%)" />
        </linearGradient>
      </defs>
      <rect width="1500" height="500" fill="url(#bannerGradient)" />
      <circle cx="1240" cy="88" r="220" fill="rgba(255,255,255,0.08)" />
      <circle cx="182" cy="454" r="176" fill="rgba(255,255,255,0.06)" />
      <text
        x="86"
        y="406"
        font-family="Helvetica, Arial, sans-serif"
        font-size="72"
        font-weight="700"
        fill="rgba(255,255,255,0.88)"
      >
        ${safeLabel}
      </text>
    </svg>
  `;

  return toDataUri(svg);
}
