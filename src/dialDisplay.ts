import { svgB64 } from './icons.js';

export function getStrength(rssi: number, mode: string): number {
  if (mode !== 'FM') {
    if (rssi <=  1) return  1; if (rssi <=  2) return  2;
    if (rssi <=  3) return  3; if (rssi <=  4) return  4;
    if (rssi <= 10) return  5; if (rssi <= 16) return  6;
    if (rssi <= 22) return  7; if (rssi <= 28) return  8;
    if (rssi <= 34) return  9; if (rssi <= 44) return 10;
    if (rssi <= 54) return 11; if (rssi <= 64) return 12;
    if (rssi <= 74) return 13; if (rssi <= 84) return 14;
    if (rssi <= 94) return 15; if (rssi <= 95) return 16;
    return 17;
  } else {
    if (rssi <=  1) return  1; if (rssi <=  2) return  7;
    if (rssi <=  8) return  8; if (rssi <= 14) return  9;
    if (rssi <= 24) return 10; if (rssi <= 34) return 11;
    if (rssi <= 44) return 12; if (rssi <= 54) return 13;
    if (rssi <= 64) return 14; if (rssi <= 74) return 15;
    if (rssi <= 76) return 16;
    return 17;
  }
}

export function freqParts(freq: number, mode: string): { num: string; unit: string } {
  if (mode === 'FM') return { num: (freq / 1000000).toFixed(1), unit: 'MHz' };
  if (freq >= 1000000) return { num: (freq / 1000).toFixed(0), unit: 'kHz' };
  return { num: String(freq / 1000), unit: 'kHz' };
}

const SEGS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc',     '2': 'abdeg',  '3': 'abcdg',
  '4': 'bcfg',   '5': 'acdfg',  '6': 'acdefg', '7': 'abc',
  '8': 'abcdefg','9': 'abcdfg', '.': '.',       '-': 'g',
  // letters used in band names
  'A': 'abcefg', 'B': 'bcdefg', 'C': 'adef',   'F': 'aefg',
  'H': 'bcefg',  'L': 'def',    'M': 'abcef',  'V': 'bcdef',
  'W': 'bcdef',
};

export function seg7svg(numStr: string, unit: string, svgW: number, svgH: number, extraT = 0, scale = 1.0): string {
  const n = (v: number) => v.toFixed(1);
  const DH  = svgH * 0.65 * scale;
  const DW  = DH * 0.56;
  const T   = Math.max(3, DH * 0.10) + extraT;
  const DOT = T * 1.6;
  const CG  = 3;

  const poly = (pts: [number,number][], fill: string) =>
    `<polygon points="${pts.map(([px,py]) => `${n(px)},${n(py)}`).join(' ')}" fill="${fill}"/>`;
  // horizontal, inner=bottom ('a')
  const segTop = (x: number, y: number, w: number, h: number, fill: string) => {
    const c = h / 2;
    return poly([[x,y],[x+w,y],[x+w,y+h-c],[x+w-c,y+h],[x+c,y+h],[x,y+h-c]], fill);
  };
  // horizontal, inner=top ('d')
  const segBot = (x: number, y: number, w: number, h: number, fill: string) => {
    const c = h / 2;
    return poly([[x+c,y],[x+w-c,y],[x+w,y+c],[x+w,y+h],[x,y+h],[x,y+c]], fill);
  };
  // horizontal, inner=both ('g')
  const segMid = (x: number, y: number, w: number, h: number, fill: string) => {
    const c = h / 2;
    return poly([[x+c,y],[x+w-c,y],[x+w,y+c],[x+w-c,y+h],[x+c,y+h],[x,y+c]], fill);
  };
  // vertical, inner=left ('b','c')
  const segRight = (x: number, y: number, w: number, h: number, fill: string) => {
    const c = w / 2;
    return poly([[x+c,y],[x+w,y],[x+w,y+h],[x+c,y+h],[x,y+h-c],[x,y+c]], fill);
  };
  // vertical, inner=right ('e','f')
  const segLeft = (x: number, y: number, w: number, h: number, fill: string) => {
    const c = w / 2;
    return poly([[x,y],[x+w-c,y],[x+w,y+c],[x+w,y+h-c],[x+w-c,y+h],[x,y+h]], fill);
  };

  let numTotalW = 0;
  for (const c of numStr) numTotalW += (c === '.' ? DOT : DW) + CG;
  const unitSize = DH * 0.50;
  const unitW = unit.length * unitSize * 0.68;
  const totalW = numTotalW + 4 + unitW;

  let cx = (svgW - totalW) / 2;
  const oy = (svgH - DH) / 2;
  let out = '';

  for (const c of numStr) {
    if (c === '.') {
      out += `<rect x="${n(cx)}" y="${n(oy+DH-DOT)}" width="${n(DOT)}" height="${n(DOT)}" fill="white" rx="1"/>`;
      cx += DOT + CG;
    } else {
      const on = SEGS[c] ?? '';
      const G = 0;
      const f = (id: string) => on.includes(id) ? 'white' : '#1e1e1e';
      out += segTop  (cx+T+G,  oy,             DW-2*(T+G), T,              f('a'));
      out += segRight(cx+DW-T, oy+T+G,         T,          DH/2-3*T/2-2*G, f('b'));
      out += segRight(cx+DW-T, oy+DH/2+T/2+G, T,          DH/2-3*T/2-2*G, f('c'));
      out += segBot  (cx+T+G,  oy+DH-T,       DW-2*(T+G), T,              f('d'));
      out += segLeft (cx,      oy+DH/2+T/2+G, T,          DH/2-3*T/2-2*G, f('e'));
      out += segLeft (cx,      oy+T+G,         T,          DH/2-3*T/2-2*G, f('f'));
      out += segMid  (cx+T+G,  oy+DH/2-T/2,   DW-2*(T+G), T,              f('g'));
      cx += DW + CG;
    }
  }

  out += `<text x="${n(cx+4)}" y="${n(oy+DH-1)}" font-family="monospace" font-size="${n(unitSize)}" fill="white">${unit}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}">${out}</svg>`;
}

export function makeHeaderSvg(label: string, stereo = false): string {
  const charW = 8.5;
  const textW = label.length * charW;
  const BADGE_W = 44, GAP = 5;
  const groupW = stereo ? textW + GAP + BADGE_W : textW;
  const groupStart = 100 - groupW / 2;
  const textX = (groupStart + textW / 2).toFixed(1);
  const badgeX = Math.round(groupStart + textW + GAP);
  const badge = stereo
    ? `<rect x="${badgeX}" y="1" width="${BADGE_W}" height="13" rx="3" fill="none" stroke="#ff3333" stroke-width="1.2"/>` +
      `<text x="${badgeX + BADGE_W / 2}" y="11" font-family="monospace" font-size="9" fill="#ff3333" text-anchor="middle">STEREO</text>`
    : '';
  return svgB64(`<svg width="200" height="16" xmlns="http://www.w3.org/2000/svg">` +
    `<text x="${textX}" y="13" font-family="monospace" font-size="14" fill="white" text-anchor="middle">${label}</text>` +
    `${badge}</svg>`);
}

export function makeBorderSvg(side: 'left' | 'right' | 'center' | 'none'): string {
  if (side === 'none') return svgB64(`<svg width="200" height="92" xmlns="http://www.w3.org/2000/svg"></svg>`);
  const C = '#888888';
  const top  = `<line x1="0" y1="0" x2="200" y2="0" stroke="${C}" stroke-width="1"/>`;
  const bot  = `<line x1="0" y1="91" x2="200" y2="91" stroke="${C}" stroke-width="1"/>`;
  const vert = side === 'left'
    ? `<line x1="0" y1="0" x2="0" y2="92" stroke="${C}" stroke-width="1"/>`
    : side === 'right'
    ? `<line x1="199" y1="0" x2="199" y2="92" stroke="${C}" stroke-width="1"/>`
    : '';
  return svgB64(`<svg width="200" height="92" xmlns="http://www.w3.org/2000/svg">${top}${vert}${bot}</svg>`);
}

const SEG_W = 4, SEG_GAP = 1, SEG_STEP = SEG_W + SEG_GAP;
const N_SEGS = 30;

export function rssiBandSvg(rssiBar: number): string {
  const W = 150, H = 6;
  const filled = Math.round(rssiBar / 100 * N_SEGS);
  const split = Math.round(10 / 17 * N_SEGS);
  let out = `<rect width="${W}" height="${H}" fill="#111111"/>`;
  for (let i = 0; i < N_SEGS; i++) {
    const x = i * SEG_STEP;
    const color = i < filled ? (i < split ? '#00ff00' : '#ff0000') : '#2a2a2a';
    out += `<rect x="${x}" y="0" width="${SEG_W}" height="${H}" fill="${color}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${out}</svg>`;
}

export function volBarSvg(pct: number): string {
  const W = 150, H = 6;
  const fillX = Math.round(W * pct / 100);
  const bg = `<rect width="${W}" height="${H}" fill="#333333" rx="1"/>`;
  if (fillX <= 0) return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${bg}</svg>`;
  const bar = `<rect width="${fillX}" height="${H}" fill="#55aaff" rx="1"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${bg}${bar}</svg>`;
}

export function snrBarSvg(pct: number): string {
  const W = 150, H = 6;
  const filled = Math.round(pct / 100 * N_SEGS);
  let out = `<rect width="${W}" height="${H}" fill="#111111"/>`;
  for (let i = 0; i < N_SEGS; i++) {
    const x = i * SEG_STEP;
    const color = i < filled ? '#00ff00' : '#2a2a2a';
    out += `<rect x="${x}" y="0" width="${SEG_W}" height="${H}" fill="${color}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${out}</svg>`;
}
