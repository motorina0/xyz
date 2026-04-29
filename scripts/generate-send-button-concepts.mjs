import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'output', 'send-button-concepts');
const WIDTH = 1600;
const HEIGHT = 1040;

const basePalette = {
  ink: '#152638',
  inkSoft: '#395069',
  text: '#203042',
  textMuted: '#66788b',
  surface: '#f9fbfe',
  surfaceSoft: '#eef4fa',
  border: '#d8e4ef',
  borderStrong: '#bfd3e4',
  primary: '#4fa9e6',
  primaryDeep: '#1e82c4',
  primaryBright: '#7ad7ff',
  panel: '#ffffff',
  panelShadow: 'rgba(27, 52, 81, 0.12)',
  glow: 'rgba(79, 169, 230, 0.22)',
  glowStrong: 'rgba(79, 169, 230, 0.36)',
  warm: '#f7fbff'
};

const conceptFamilies = [
  {
    id: 'relay-core',
    title: 'Relay Core',
    strap: 'A message becomes a network pulse instead of a paper plane.',
    story: 'Best fit for a Nostr app. The core dot and asymmetric relay arcs make the send action feel native to relays, publishing, and network reach.',
    chips: ['Nostr-native', 'signal pulse', 'ownable silhouette'],
    buttonLabel: 'Pulse',
    variants: [
      {
        id: 'pulse-halo',
        title: 'Pulse Halo',
        accentA: '#4fa9e6',
        accentB: '#7ad7ff',
        accentC: '#0e6bb8',
        note: 'Fast halo arcs that feel live and lightweight.',
        mood: 'bright'
      },
      {
        id: 'offset-arcs',
        title: 'Offset Arcs',
        accentA: '#43b7d8',
        accentB: '#87e0ef',
        accentC: '#165e9e',
        note: 'A more editorial, premium version with offset relay bands.',
        mood: 'cool'
      },
      {
        id: 'signal-lock',
        title: 'Signal Lock',
        accentA: '#4fa9e6',
        accentB: '#98d6ff',
        accentC: '#183d66',
        note: 'Structured arcs and a locked center for a confident brand mark.',
        mood: 'deep'
      }
    ]
  },
  {
    id: 'seal-break',
    title: 'Seal Break',
    strap: 'Sending feels deliberate, private, and irreversible, like breaking a trusted seal.',
    story: 'This direction leans into privacy and intention. It feels premium and memorable, especially for secure direct messages.',
    chips: ['private', 'ceremonial', 'premium'],
    buttonLabel: 'Seal',
    variants: [
      {
        id: 'wax-stamp',
        title: 'Wax Stamp',
        accentA: '#4fa9e6',
        accentB: '#bfe4ff',
        accentC: '#1c5f99',
        note: 'A soft wax-like center with a crisp branded split.',
        mood: 'soft'
      },
      {
        id: 'split-crest',
        title: 'Split Crest',
        accentA: '#6ab5ec',
        accentB: '#d8efff',
        accentC: '#234e7c',
        note: 'More heraldic and formal, with a crest-like central break.',
        mood: 'formal'
      },
      {
        id: 'broken-seal',
        title: 'Broken Seal',
        accentA: '#48a0d9',
        accentB: '#a9dbfb',
        accentC: '#122b46',
        note: 'A stronger fracture line for a bolder signature moment.',
        mood: 'bold'
      }
    ]
  },
  {
    id: 'thread-knot',
    title: 'Thread Knot',
    strap: 'The send action becomes a proprietary conversation glyph built from one continuous line.',
    story: 'This is the most logo-like family. It can evolve into a wordmark companion because the knot can live as a standalone app symbol.',
    chips: ['glyphable', 'continuous line', 'conversation thread'],
    buttonLabel: 'Knot',
    variants: [
      {
        id: 'loop-knot',
        title: 'Loop Knot',
        accentA: '#4fa9e6',
        accentB: '#8edbff',
        accentC: '#1a5a8d',
        note: 'Soft loops that still read clearly at small sizes.',
        mood: 'soft'
      },
      {
        id: 'weave-knot',
        title: 'Weave Knot',
        accentA: '#35b2cc',
        accentB: '#8be9e3',
        accentC: '#14536d',
        note: 'A slightly more crafted, woven motion.',
        mood: 'woven'
      },
      {
        id: 'tied-thread',
        title: 'Tied Thread',
        accentA: '#5f9fe6',
        accentB: '#c4e0ff',
        accentC: '#203b6d',
        note: 'Longer loose ends make the knot feel directional and alive.',
        mood: 'directional'
      }
    ]
  },
  {
    id: 'spark-capsule',
    title: 'Spark Capsule',
    strap: 'A compact premium capsule with a moving spark instead of a literal send icon.',
    story: 'This family feels product-forward and modern. It can become a tiny signature motion system with trails, streaks, and a traveling spark.',
    chips: ['premium UI', 'motion-friendly', 'minimal'],
    buttonLabel: 'Spark',
    variants: [
      {
        id: 'drift-spark',
        title: 'Drift Spark',
        accentA: '#4fa9e6',
        accentB: '#8be3ff',
        accentC: '#0f6eb6',
        note: 'A soft star drifting through a polished capsule.',
        mood: 'airy'
      },
      {
        id: 'comet-core',
        title: 'Comet Core',
        accentA: '#57b0ff',
        accentB: '#c6eeff',
        accentC: '#17538d',
        note: 'Sharper trails push the capsule closer to a hero product control.',
        mood: 'kinetic'
      },
      {
        id: 'spark-trail',
        title: 'Spark Trail',
        accentA: '#34b0d0',
        accentB: '#bdf6f6',
        accentC: '#145a73',
        note: 'Small light beads give the control a memorable signature rhythm.',
        mood: 'trail'
      }
    ]
  },
  {
    id: 'orbit-send',
    title: 'Orbit Send',
    strap: 'Sending feels like releasing a signal into an orbit, not launching an arrow.',
    story: 'This direction is abstract and brandable without becoming decorative. The incomplete orbit can animate beautifully and remain recognizable at tiny sizes.',
    chips: ['orbital', 'balanced', 'abstract'],
    buttonLabel: 'Orbit',
    variants: [
      {
        id: 'eclipse-orbit',
        title: 'Eclipse Orbit',
        accentA: '#4fa9e6',
        accentB: '#9ed7ff',
        accentC: '#173f69',
        note: 'A clean eclipse-like orbit with a bright core.',
        mood: 'clean'
      },
      {
        id: 'open-arc',
        title: 'Open Arc',
        accentA: '#34b0d0',
        accentB: '#9ceff2',
        accentC: '#14546b',
        note: 'The most understated family member, with a luxurious open arc.',
        mood: 'understated'
      },
      {
        id: 'dual-ring',
        title: 'Dual Ring',
        accentA: '#5aa2ee',
        accentB: '#c6e3ff',
        accentC: '#1d4676',
        note: 'Two rings make the mark feel established and emblematic.',
        mood: 'emblem'
      }
    ]
  }
];

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function wrapTextLines(text, maxChars) {
  const words = String(text).split(/\s+/u);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= maxChars || !currentLine) {
      currentLine = candidate;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function polar(cx, cy, radius, degrees) {
  const radians = (degrees - 90) * (Math.PI / 180);
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians)
  };
}

function arcPath(cx, cy, radius, start, end) {
  const startPoint = polar(cx, cy, radius, start);
  const endPoint = polar(cx, cy, radius, end);
  const largeArc = Math.abs(end - start) > 180 ? 1 : 0;
  const sweep = end > start ? 1 : 0;
  return `M ${startPoint.x.toFixed(2)} ${startPoint.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${endPoint.x.toFixed(2)} ${endPoint.y.toFixed(2)}`;
}

function ellipseArcPath(cx, cy, rx, ry, rotation, start, end) {
  const startRad = (start * Math.PI) / 180;
  const endRad = (end * Math.PI) / 180;
  const rotate = (x, y) => {
    const r = (rotation * Math.PI) / 180;
    return {
      x: cx + x * Math.cos(r) - y * Math.sin(r),
      y: cy + x * Math.sin(r) + y * Math.cos(r)
    };
  };

  const startPoint = rotate(rx * Math.cos(startRad), ry * Math.sin(startRad));
  const endPoint = rotate(rx * Math.cos(endRad), ry * Math.sin(endRad));
  const largeArc = Math.abs(end - start) > 180 ? 1 : 0;
  const sweep = end > start ? 1 : 0;
  return `M ${startPoint.x.toFixed(2)} ${startPoint.y.toFixed(2)} A ${rx} ${ry} ${rotation} ${largeArc} ${sweep} ${endPoint.x.toFixed(2)} ${endPoint.y.toFixed(2)}`;
}

function chip(x, y, text, fill = '#f1f7fd', stroke = '#d8e7f4', ink = basePalette.inkSoft) {
  const width = Math.max(110, text.length * 11 + 36);
  return `
    <g transform="translate(${x} ${y})">
      <rect width="${width}" height="38" rx="19" fill="${fill}" stroke="${stroke}" />
      <text x="${width / 2}" y="24" font-family="Space Grotesk, Manrope, system-ui, sans-serif" font-size="16" font-weight="700" text-anchor="middle" fill="${ink}">${esc(text)}</text>
    </g>
  `;
}

function messageBubble(x, y, width, height, fill, title, body, align = 'left') {
  const titleX = align === 'left' ? x + 18 : x + width - 18;
  const bodyX = align === 'left' ? x + 18 : x + width - 18;
  const anchor = align === 'left' ? 'start' : 'end';
  return `
    <g>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="24" fill="${fill}" />
      <text x="${titleX}" y="${y + 26}" font-family="Manrope, system-ui, sans-serif" font-size="15" font-weight="800" text-anchor="${anchor}" fill="${basePalette.ink}">${esc(title)}</text>
      <text x="${bodyX}" y="${y + 50}" font-family="Manrope, system-ui, sans-serif" font-size="16" font-weight="600" text-anchor="${anchor}" fill="${basePalette.inkSoft}">${esc(body)}</text>
    </g>
  `;
}

function tinySignal(x, y, accent) {
  return `
    <g transform="translate(${x} ${y})">
      <circle cx="0" cy="0" r="5" fill="${accent}" />
      <path d="${arcPath(0, 0, 14, 220, 315)}" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round" opacity="0.8" />
      <path d="${arcPath(0, 0, 22, 225, 305)}" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linecap="round" opacity="0.55" />
    </g>
  `;
}

function renderRelayCoreGlyph(cx, cy, scale, variant) {
  const inner = 10 * scale;
  const rings = variant.id === 'offset-arcs'
    ? [
        { r: 26, start: 215, end: 325, w: 7, o: 0.95 },
        { r: 39, start: 310, end: 64, w: 5, o: 0.78 },
        { r: 52, start: 118, end: 214, w: 4, o: 0.6 }
      ]
    : variant.id === 'signal-lock'
      ? [
          { r: 24, start: 205, end: 340, w: 7, o: 1 },
          { r: 38, start: 22, end: 150, w: 5, o: 0.78 },
          { r: 52, start: 196, end: 262, w: 4, o: 0.62 }
        ]
      : [
          { r: 24, start: 210, end: 332, w: 7, o: 1 },
          { r: 38, start: 14, end: 134, w: 5, o: 0.75 },
          { r: 52, start: 138, end: 214, w: 4, o: 0.55 }
        ];

  const satellite = variant.id === 'offset-arcs'
    ? `<circle cx="${cx + 50 * scale}" cy="${cy - 24 * scale}" r="${5 * scale}" fill="${variant.accentB}" opacity="0.9" />`
    : variant.id === 'signal-lock'
      ? `<rect x="${cx + 42 * scale}" y="${cy - 9 * scale}" width="${14 * scale}" height="${14 * scale}" rx="${4 * scale}" fill="${variant.accentB}" opacity="0.85" />`
      : `<circle cx="${cx + 48 * scale}" cy="${cy - 30 * scale}" r="${4 * scale}" fill="${variant.accentB}" opacity="0.75" />`;

  return `
    <circle cx="${cx}" cy="${cy}" r="${inner}" fill="${variant.accentB}" />
    <circle cx="${cx}" cy="${cy}" r="${5.5 * scale}" fill="${variant.accentC}" opacity="0.8" />
    ${rings
      .map(
        (ring) => `
          <path
            d="${arcPath(cx, cy, ring.r * scale, ring.start, ring.end)}"
            fill="none"
            stroke="${variant.accentA}"
            stroke-width="${ring.w * scale}"
            stroke-linecap="round"
            opacity="${ring.o}"
          />
        `
      )
      .join('')}
    ${satellite}
  `;
}

function renderSealBreakGlyph(cx, cy, scale, variant) {
  const ridgeCount = variant.id === 'broken-seal' ? 16 : 20;
  const ridges = Array.from({ length: ridgeCount }, (_, index) => {
    const angle = (360 / ridgeCount) * index;
    const p1 = polar(cx, cy, 43 * scale, angle);
    const p2 = polar(cx, cy, 52 * scale, angle);
    return `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${variant.accentB}" stroke-width="${3.2 * scale}" stroke-linecap="round" opacity="0.9" />`;
  }).join('');

  const crack = variant.id === 'split-crest'
    ? `M ${cx - 6 * scale} ${cy - 28 * scale} L ${cx + 6 * scale} ${cy - 6 * scale} L ${cx - 2 * scale} ${cy + 7 * scale} L ${cx + 14 * scale} ${cy + 30 * scale}`
    : variant.id === 'broken-seal'
      ? `M ${cx - 18 * scale} ${cy - 30 * scale} L ${cx + 2 * scale} ${cy - 8 * scale} L ${cx - 8 * scale} ${cy + 8 * scale} L ${cx + 16 * scale} ${cy + 30 * scale}`
      : `M ${cx - 10 * scale} ${cy - 24 * scale} L ${cx + 2 * scale} ${cy - 4 * scale} L ${cx - 4 * scale} ${cy + 8 * scale} L ${cx + 12 * scale} ${cy + 24 * scale}`;

  const notch = variant.id === 'wax-stamp'
    ? `<path d="M ${cx + 36 * scale} ${cy - 34 * scale} L ${cx + 62 * scale} ${cy - 22 * scale} L ${cx + 39 * scale} ${cy - 8 * scale} Z" fill="#f2f7fd" opacity="0.95" />`
    : variant.id === 'split-crest'
      ? `<path d="M ${cx + 26 * scale} ${cy - 42 * scale} L ${cx + 56 * scale} ${cy - 34 * scale} L ${cx + 34 * scale} ${cy - 2 * scale} Z" fill="#f2f7fd" opacity="0.92" />`
      : `<path d="M ${cx + 30 * scale} ${cy - 40 * scale} L ${cx + 58 * scale} ${cy - 24 * scale} L ${cx + 38 * scale} ${cy + 4 * scale} Z" fill="#f2f7fd" opacity="0.92" />`;

  return `
    ${ridges}
    <circle cx="${cx}" cy="${cy}" r="${42 * scale}" fill="${variant.accentB}" opacity="0.9" />
    <circle cx="${cx}" cy="${cy}" r="${32 * scale}" fill="${variant.accentA}" opacity="0.28" />
    ${notch}
    <path d="${crack}" fill="none" stroke="${variant.accentC}" stroke-width="${6 * scale}" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="${cx}" cy="${cy}" r="${13 * scale}" fill="${variant.accentC}" opacity="0.12" />
  `;
}

function renderThreadKnotGlyph(cx, cy, scale, variant, background = '#ffffff') {
  const path =
    variant.id === 'weave-knot'
      ? `M ${cx - 44 * scale} ${cy + 10 * scale}
         C ${cx - 30 * scale} ${cy - 44 * scale}, ${cx + 18 * scale} ${cy - 44 * scale}, ${cx + 22 * scale} ${cy - 4 * scale}
         C ${cx + 24 * scale} ${cy + 18 * scale}, ${cx - 6 * scale} ${cy + 24 * scale}, ${cx - 6 * scale} ${cy + 2 * scale}
         C ${cx - 6 * scale} ${cy - 22 * scale}, ${cx + 32 * scale} ${cy - 20 * scale}, ${cx + 44 * scale} ${cy + 24 * scale}`
      : variant.id === 'tied-thread'
        ? `M ${cx - 50 * scale} ${cy + 24 * scale}
           C ${cx - 40 * scale} ${cy - 28 * scale}, ${cx - 8 * scale} ${cy - 34 * scale}, ${cx + 4 * scale} ${cy - 4 * scale}
           C ${cx + 16 * scale} ${cy + 24 * scale}, ${cx - 20 * scale} ${cy + 30 * scale}, ${cx - 2 * scale} ${cy + 2 * scale}
           C ${cx + 16 * scale} ${cy - 28 * scale}, ${cx + 40 * scale} ${cy - 12 * scale}, ${cx + 48 * scale} ${cy - 34 * scale}`
        : `M ${cx - 48 * scale} ${cy + 18 * scale}
           C ${cx - 38 * scale} ${cy - 30 * scale}, ${cx - 4 * scale} ${cy - 34 * scale}, ${cx + 6 * scale} ${cy - 6 * scale}
           C ${cx + 16 * scale} ${cy + 18 * scale}, ${cx - 18 * scale} ${cy + 26 * scale}, ${cx - 4 * scale} ${cy + 4 * scale}
           C ${cx + 12 * scale} ${cy - 18 * scale}, ${cx + 32 * scale} ${cy - 6 * scale}, ${cx + 46 * scale} ${cy + 22 * scale}`;

  const underPass = variant.id === 'weave-knot'
    ? `<path d="M ${cx - 2 * scale} ${cy - 7 * scale} C ${cx + 8 * scale} ${cy - 2 * scale}, ${cx + 10 * scale} ${cy + 10 * scale}, ${cx - 2 * scale} ${cy + 18 * scale}" fill="none" stroke="${background}" stroke-width="${10 * scale}" stroke-linecap="round" />`
    : `<path d="M ${cx - 7 * scale} ${cy - 1 * scale} C ${cx + 8 * scale} ${cy + 6 * scale}, ${cx + 8 * scale} ${cy + 16 * scale}, ${cx - 2 * scale} ${cy + 20 * scale}" fill="none" stroke="${background}" stroke-width="${10 * scale}" stroke-linecap="round" />`;

  const tail = variant.id === 'tied-thread'
    ? `<path d="M ${cx + 28 * scale} ${cy - 30 * scale} L ${cx + 54 * scale} ${cy - 56 * scale}" stroke="${variant.accentB}" stroke-width="${5 * scale}" stroke-linecap="round" opacity="0.75" />`
    : `<path d="M ${cx + 34 * scale} ${cy + 20 * scale} L ${cx + 56 * scale} ${cy + 42 * scale}" stroke="${variant.accentB}" stroke-width="${4.5 * scale}" stroke-linecap="round" opacity="0.7" />`;

  return `
    <path d="${path}" fill="none" stroke="${variant.accentB}" stroke-width="${10 * scale}" stroke-linecap="round" stroke-linejoin="round" opacity="0.95" />
    ${underPass}
    <path d="${path}" fill="none" stroke="${variant.accentA}" stroke-width="${7 * scale}" stroke-linecap="round" stroke-linejoin="round" />
    ${tail}
  `;
}

function renderSparkGlyph(cx, cy, scale, variant) {
  const star = `
    <path
      d="M ${cx} ${cy - 18 * scale}
         L ${cx + 6 * scale} ${cy - 6 * scale}
         L ${cx + 18 * scale} ${cy}
         L ${cx + 6 * scale} ${cy + 6 * scale}
         L ${cx} ${cy + 18 * scale}
         L ${cx - 6 * scale} ${cy + 6 * scale}
         L ${cx - 18 * scale} ${cy}
         L ${cx - 6 * scale} ${cy - 6 * scale} Z"
      fill="${variant.accentB}"
    />
  `;

  const trail = variant.id === 'comet-core'
    ? `
      <path d="M ${cx - 72 * scale} ${cy + 7 * scale} C ${cx - 46 * scale} ${cy - 1 * scale}, ${cx - 28 * scale} ${cy - 2 * scale}, ${cx - 14 * scale} ${cy + 2 * scale}" stroke="${variant.accentA}" stroke-width="${8 * scale}" stroke-linecap="round" opacity="0.35" />
      <path d="M ${cx - 88 * scale} ${cy + 16 * scale} C ${cx - 54 * scale} ${cy + 9 * scale}, ${cx - 32 * scale} ${cy + 8 * scale}, ${cx - 16 * scale} ${cy + 10 * scale}" stroke="${variant.accentA}" stroke-width="${5 * scale}" stroke-linecap="round" opacity="0.24" />
    `
    : variant.id === 'spark-trail'
      ? `
        <circle cx="${cx - 58 * scale}" cy="${cy + 2 * scale}" r="${7 * scale}" fill="${variant.accentA}" opacity="0.35" />
        <circle cx="${cx - 38 * scale}" cy="${cy + 2 * scale}" r="${5 * scale}" fill="${variant.accentA}" opacity="0.5" />
        <circle cx="${cx - 22 * scale}" cy="${cy + 1 * scale}" r="${3.5 * scale}" fill="${variant.accentA}" opacity="0.7" />
      `
      : `
        <path d="M ${cx - 68 * scale} ${cy + 6 * scale} C ${cx - 44 * scale} ${cy + 4 * scale}, ${cx - 26 * scale} ${cy + 2 * scale}, ${cx - 12 * scale} ${cy + 2 * scale}" stroke="${variant.accentA}" stroke-width="${6 * scale}" stroke-linecap="round" opacity="0.28" />
      `;

  return `${trail}${star}`;
}

function renderOrbitGlyph(cx, cy, scale, variant) {
  const core = `
    <circle cx="${cx}" cy="${cy}" r="${11 * scale}" fill="${variant.accentB}" />
    <circle cx="${cx}" cy="${cy}" r="${5.5 * scale}" fill="${variant.accentC}" opacity="0.88" />
  `;

  const rings = variant.id === 'dual-ring'
    ? `
      <path d="${ellipseArcPath(cx, cy, 56 * scale, 34 * scale, -22, 18, 324)}" fill="none" stroke="${variant.accentA}" stroke-width="${7 * scale}" stroke-linecap="round" />
      <path d="${ellipseArcPath(cx, cy, 44 * scale, 24 * scale, 28, 40, 312)}" fill="none" stroke="${variant.accentB}" stroke-width="${4.5 * scale}" stroke-linecap="round" opacity="0.85" />
      <circle cx="${cx + 34 * scale}" cy="${cy - 26 * scale}" r="${4.5 * scale}" fill="${variant.accentB}" />
    `
    : variant.id === 'open-arc'
      ? `
        <path d="${ellipseArcPath(cx, cy, 56 * scale, 34 * scale, -20, 44, 294)}" fill="none" stroke="${variant.accentA}" stroke-width="${6.5 * scale}" stroke-linecap="round" />
        <path d="${ellipseArcPath(cx, cy, 40 * scale, 22 * scale, 18, 214, 334)}" fill="none" stroke="${variant.accentB}" stroke-width="${4 * scale}" stroke-linecap="round" opacity="0.68" />
      `
      : `
        <path d="${ellipseArcPath(cx, cy, 54 * scale, 32 * scale, -26, 24, 320)}" fill="none" stroke="${variant.accentA}" stroke-width="${7 * scale}" stroke-linecap="round" />
        <circle cx="${cx + 38 * scale}" cy="${cy - 28 * scale}" r="${5 * scale}" fill="${variant.accentB}" />
      `;

  return `${rings}${core}`;
}

function renderButtonGraphic(cx, cy, variant, familyId, size, mode = 'large') {
  const isCapsule = familyId === 'spark-capsule';
  const width = isCapsule ? size * 1.65 : size;
  const height = size;
  const x = cx - width / 2;
  const y = cy - height / 2;
  const radius = isCapsule ? height / 2 : size / 2;
  const shadowOpacity = mode === 'large' ? 0.18 : 0.2;
  const outlineOpacity = mode === 'large' ? 0.9 : 0.72;

  const background = `
    <g>
      <rect x="${x}" y="${y + 8}" width="${width}" height="${height}" rx="${radius}" fill="#133250" opacity="${shadowOpacity}" />
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${variant.accentC}" stroke="#ffffff" stroke-opacity="${outlineOpacity}" stroke-width="${mode === 'large' ? 2 : 1.5}" />
      <rect x="${x + 2}" y="${y + 2}" width="${width - 4}" height="${height - 4}" rx="${Math.max(12, radius - 2)}" fill="${variant.accentA}" fill-opacity="0.22" opacity="${mode === 'large' ? 1 : 0.9}" />
    </g>
  `;

  const glyphScale = mode === 'large' ? size / 120 : size / 60;
  const glyph = familyId === 'relay-core'
    ? renderRelayCoreGlyph(cx, cy, glyphScale, variant)
    : familyId === 'seal-break'
      ? renderSealBreakGlyph(cx, cy, glyphScale, variant)
      : familyId === 'thread-knot'
        ? renderThreadKnotGlyph(cx, cy, glyphScale, variant, variant.accentA)
        : familyId === 'spark-capsule'
          ? renderSparkGlyph(cx + width * 0.06, cy, glyphScale, variant)
          : renderOrbitGlyph(cx, cy, glyphScale, variant);

  const flare = familyId === 'spark-capsule'
    ? `<ellipse cx="${cx + width * 0.18}" cy="${cy - height * 0.18}" rx="${width * 0.24}" ry="${height * 0.17}" fill="#ffffff" fill-opacity="0.18" />`
    : `<circle cx="${cx - size * 0.14}" cy="${cy - size * 0.14}" r="${size * 0.16}" fill="#ffffff" fill-opacity="0.18" />`;

  return `${background}${flare}${glyph}`;
}

function renderDefs(variant) {
  return `
    <defs />
  `;
}

function renderBackground(variant) {
  const circles = [
    { cx: 240, cy: 210, r: 160, opacity: 0.18 },
    { cx: 1280, cy: 180, r: 200, opacity: 0.22 },
    { cx: 1360, cy: 860, r: 240, opacity: 0.14 }
  ];

  const signalGrid = Array.from({ length: 9 }, (_, index) => {
    const x = 96 + index * 108;
    return `<line x1="${x}" y1="128" x2="${x}" y2="936" stroke="#133250" stroke-opacity="0.04" />`;
  }).join('');

  return `
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#edf4fb" />
    ${circles
      .map(
        (circle) => `<circle cx="${circle.cx}" cy="${circle.cy}" r="${circle.r}" fill="${variant.accentB}" opacity="${circle.opacity}" />`
      )
      .join('')}
    <g stroke-width="1">${signalGrid}</g>
    <circle cx="1420" cy="130" r="8" fill="${variant.accentB}" opacity="0.9" />
    <circle cx="1460" cy="164" r="4" fill="${variant.accentA}" opacity="0.8" />
  `;
}

function renderAppPanel(family, variant) {
  const panelX = 70;
  const panelY = 118;
  const panelW = 640;
  const panelH = 810;
  const composerY = panelY + panelH - 138;
  const sendSize = family.id === 'spark-capsule' ? 68 : 62;
  const sendWidth = family.id === 'spark-capsule' ? 108 : sendSize;
  const sendCenterX = panelX + panelW - 62 - sendWidth / 2;
  const sendCenterY = composerY + 68;
  const inputX = panelX + 28;
  const inputY = composerY + 36;
  const inputW = panelW - sendWidth - 122;

  return `
    <g>
      <rect x="${panelX}" y="${panelY + 20}" width="${panelW}" height="${panelH}" rx="38" fill="#0f253b" opacity="0.08" />
      <rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="38" fill="${basePalette.panel}" stroke="${basePalette.borderStrong}" />
      <rect x="${panelX}" y="${panelY}" width="${panelW}" height="86" rx="38" fill="${variant.accentA}" opacity="0.08" />
      <circle cx="${panelX + 56}" cy="${panelY + 44}" r="24" fill="${variant.accentA}" opacity="0.22" />
      <circle cx="${panelX + 56}" cy="${panelY + 44}" r="13" fill="${variant.accentC}" opacity="0.88" />
      <text x="${panelX + 94}" y="${panelY + 38}" font-family="Space Grotesk, Manrope, system-ui, sans-serif" font-size="24" font-weight="700" fill="${basePalette.ink}">Nostr Chat</text>
      <text x="${panelX + 94}" y="${panelY + 62}" font-family="Manrope, system-ui, sans-serif" font-size="16" font-weight="700" fill="${basePalette.textMuted}">${esc(family.title)} concept in context</text>
      ${tinySignal(panelX + panelW - 64, panelY + 44, variant.accentA)}
      ${messageBubble(panelX + 30, panelY + 120, 260, 78, '#f2f7fc', 'Mara', 'Relay 3 is green again.', 'left')}
      ${messageBubble(panelX + 280, panelY + 228, 300, 84, '#dbf0ff', 'You', 'Nice. Ship the note when ready.', 'right')}
      ${messageBubble(panelX + 30, panelY + 350, 340, 86, '#f2f7fc', 'Mara', variant.note, 'left')}
      <rect x="${panelX + 20}" y="${panelY + panelH - 168}" width="${panelW - 40}" height="1" fill="${basePalette.border}" />
      <rect x="${inputX}" y="${inputY}" width="${inputW}" height="64" rx="26" fill="#eef4fa" stroke="#d9e4ee" />
      <circle cx="${inputX + 30}" cy="${inputY + 32}" r="18" fill="${variant.accentA}" opacity="0.14" />
      <circle cx="${inputX + 24}" cy="${inputY + 30}" r="2.8" fill="${variant.accentC}" />
      <circle cx="${inputX + 35}" cy="${inputY + 30}" r="2.8" fill="${variant.accentC}" />
      <path d="M ${inputX + 21} ${inputY + 38} Q ${inputX + 30} ${inputY + 45} ${inputX + 39} ${inputY + 38}" fill="none" stroke="${variant.accentC}" stroke-width="2.5" stroke-linecap="round" />
      <text x="${inputX + 58}" y="${inputY + 40}" font-family="Manrope, system-ui, sans-serif" font-size="18" font-weight="700" fill="#8293a5">Write a message</text>
      <text x="${inputX + 58}" y="${inputY + 58}" font-family="Manrope, system-ui, sans-serif" font-size="14" font-weight="700" fill="#9fb0c1">Trademark send moment: ${esc(family.buttonLabel)}</text>
      ${renderButtonGraphic(sendCenterX, sendCenterY, variant, family.id, sendSize, 'small')}
    </g>
  `;
}

function renderShowcasePanel(family, variant) {
  const panelX = 760;
  const panelY = 92;
  const panelW = 780;
  const panelH = 860;
  const strapLines = wrapTextLines(family.strap, 62);
  const storyLines = wrapTextLines(family.story, 72);
  const noteLines = wrapTextLines(variant.note, 58);

  return `
    <g>
      <rect x="${panelX}" y="${panelY + 18}" width="${panelW}" height="${panelH}" rx="44" fill="#112840" opacity="0.08" />
      <rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="44" fill="#ffffff" stroke="${basePalette.borderStrong}" />
      <text x="${panelX + 52}" y="${panelY + 74}" font-family="Space Grotesk, Manrope, system-ui, sans-serif" font-size="42" font-weight="700" fill="${basePalette.ink}">${esc(family.title)}</text>
      <text x="${panelX + 52}" y="${panelY + 116}" font-family="Manrope, system-ui, sans-serif" font-size="22" font-weight="700" fill="${basePalette.textMuted}">${esc(variant.title)} variation</text>
      <text x="${panelX + 52}" y="${panelY + 164}" font-family="Manrope, system-ui, sans-serif" font-size="22" font-weight="700" fill="${basePalette.inkSoft}">${strapLines.map((line, index) => `<tspan x="${panelX + 52}" dy="${index === 0 ? 0 : 30}">${esc(line)}</tspan>`).join('')}</text>
      ${chip(panelX + 52, panelY + 196, family.chips[0])}
      ${chip(panelX + 192, panelY + 196, family.chips[1])}
      ${chip(panelX + 374, panelY + 196, family.chips[2])}
      <circle cx="${panelX + 420}" cy="${panelY + 456}" r="188" fill="${variant.accentB}" opacity="0.22" />
      <circle cx="${panelX + 420}" cy="${panelY + 456}" r="134" fill="#ffffff" opacity="0.52" />
      ${renderButtonGraphic(panelX + 420, panelY + 456, variant, family.id, family.id === 'spark-capsule' ? 170 : 166, 'large')}
      <text x="${panelX + 52}" y="${panelY + 644}" font-family="Space Grotesk, Manrope, system-ui, sans-serif" font-size="26" font-weight="700" fill="${basePalette.ink}">Why it could be ownable</text>
      <text x="${panelX + 52}" y="${panelY + 686}" font-family="Manrope, system-ui, sans-serif" font-size="20" font-weight="700" fill="${basePalette.inkSoft}">${storyLines.map((line, index) => `<tspan x="${panelX + 52}" dy="${index === 0 ? 0 : 28}">${esc(line)}</tspan>`).join('')}</text>
      <rect x="${panelX + 52}" y="${panelY + 726}" width="660" height="116" rx="28" fill="#f4f9fd" stroke="#dce8f2" />
      <text x="${panelX + 86}" y="${panelY + 768}" font-family="Space Grotesk, Manrope, system-ui, sans-serif" font-size="20" font-weight="700" fill="${basePalette.ink}">Variation note</text>
      <text x="${panelX + 86}" y="${panelY + 804}" font-family="Manrope, system-ui, sans-serif" font-size="20" font-weight="700" fill="${basePalette.inkSoft}">${noteLines.map((line, index) => `<tspan x="${panelX + 86}" dy="${index === 0 ? 0 : 26}">${esc(line)}</tspan>`).join('')}</text>
      <text x="${panelX + 52}" y="${panelY + 888}" font-family="Manrope, system-ui, sans-serif" font-size="16" font-weight="800" fill="${variant.accentC}" opacity="0.78">Brand territory for Nostr Chat Send</text>
    </g>
  `;
}

function renderConceptSvg(family, variant) {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
      ${renderDefs(variant)}
      ${renderBackground(variant)}
      <text x="70" y="66" font-family="Space Grotesk, Manrope, system-ui, sans-serif" font-size="20" font-weight="700" fill="${basePalette.textMuted}" letter-spacing="1.4">CUSTOM SEND BUTTON EXPLORATION</text>
      <text x="70" y="94" font-family="Manrope, system-ui, sans-serif" font-size="16" font-weight="800" fill="${variant.accentC}" opacity="0.75">${esc(family.title.toUpperCase())} / ${esc(variant.title.toUpperCase())}</text>
      ${renderAppPanel(family, variant)}
      ${renderShowcasePanel(family, variant)}
    </svg>
  `;
}

function renderGallery(groups) {
  const cards = groups
    .map((entry) => {
      const items = entry.variants
        .map((variant) => {
          const previewFilename = variant.filename.replace(/\.svg$/u, '.png');
          return `
            <a class="card" href="./${previewFilename}">
              <img src="./${previewFilename}" alt="${esc(entry.title)} ${esc(variant.title)}" />
              <div class="meta">
                <div class="eyebrow">${esc(entry.title)}</div>
                <div class="title">${esc(variant.title)}</div>
                <div class="note">${esc(variant.note)}</div>
              </div>
            </a>
          `;
        })
        .join('');

      return `
        <section class="group">
          <div class="group-head">
            <h2>${esc(entry.title)}</h2>
            <p>${esc(entry.strap)}</p>
          </div>
          <div class="grid">${items}</div>
        </section>
      `;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Send Button Concepts</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #eef4fa;
        --panel: rgba(255, 255, 255, 0.85);
        --border: #d4e0eb;
        --ink: #17293b;
        --muted: #6d8092;
        --shadow: 0 18px 40px rgba(18, 41, 64, 0.09);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 36px;
        font-family: Manrope, system-ui, sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(79, 169, 230, 0.16), transparent 28%),
          linear-gradient(180deg, #f7fbff 0%, var(--bg) 100%);
      }
      h1, h2, p { margin: 0; }
      .hero {
        margin-bottom: 28px;
        padding: 28px 30px;
        border: 1px solid var(--border);
        border-radius: 28px;
        background: var(--panel);
        backdrop-filter: blur(10px);
        box-shadow: var(--shadow);
      }
      .hero h1 {
        font-family: "Space Grotesk", Manrope, system-ui, sans-serif;
        font-size: 34px;
        margin-bottom: 10px;
      }
      .hero p {
        max-width: 840px;
        color: var(--muted);
        font-size: 18px;
        line-height: 1.5;
      }
      .group {
        margin-bottom: 34px;
        padding: 24px;
        border: 1px solid var(--border);
        border-radius: 28px;
        background: rgba(255, 255, 255, 0.82);
        box-shadow: var(--shadow);
      }
      .group-head {
        margin-bottom: 20px;
      }
      .group h2 {
        font-family: "Space Grotesk", Manrope, system-ui, sans-serif;
        font-size: 26px;
        margin-bottom: 8px;
      }
      .group p {
        color: var(--muted);
        line-height: 1.5;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 18px;
      }
      .card {
        display: block;
        color: inherit;
        text-decoration: none;
        border: 1px solid var(--border);
        border-radius: 24px;
        overflow: hidden;
        background: white;
        box-shadow: 0 12px 28px rgba(17, 39, 61, 0.08);
        transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
      }
      .card:hover {
        transform: translateY(-2px);
        border-color: #b6cddd;
        box-shadow: 0 18px 34px rgba(17, 39, 61, 0.12);
      }
      .card img {
        display: block;
        width: 100%;
        aspect-ratio: 1600 / 1040;
        object-fit: cover;
        background: #edf4fb;
      }
      .meta {
        padding: 16px 18px 20px;
      }
      .eyebrow {
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #5b8fb6;
        margin-bottom: 8px;
      }
      .title {
        font-family: "Space Grotesk", Manrope, system-ui, sans-serif;
        font-size: 20px;
        margin-bottom: 8px;
      }
      .note {
        color: var(--muted);
        line-height: 1.45;
      }
    </style>
  </head>
  <body>
    <header class="hero">
      <h1>Send Button Concepts</h1>
      <p>Three image explorations for each of five signature directions. Each card opens the full-size SVG, and every concept is shown both in the composer context and as a close-up brand mark.</p>
    </header>
    ${cards}
  </body>
</html>`;
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const galleryGroups = [];

  for (const family of conceptFamilies) {
    const group = {
      title: family.title,
      strap: family.strap,
      variants: []
    };

    for (const variant of family.variants) {
      const filename = `${family.id}-${variant.id}.svg`;
      const svg = renderConceptSvg(family, variant);
      await writeFile(path.join(OUTPUT_DIR, filename), svg, 'utf8');
      group.variants.push({
        ...variant,
        filename
      });
    }

    galleryGroups.push(group);
  }

  const galleryHtml = renderGallery(galleryGroups);
  await writeFile(path.join(OUTPUT_DIR, 'index.html'), galleryHtml, 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
