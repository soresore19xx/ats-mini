import type { AtsStatus } from './AtsSerial.js';

export function svgB64(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const BG = `<defs>
  <radialGradient id="ibg" cx="42%" cy="35%" r="68%">
    <stop offset="0%" stop-color="#2a2a2a"/>
    <stop offset="100%" stop-color="#0d0d0d"/>
  </radialGradient>
</defs>
<rect width="72" height="72" rx="8" fill="url(#ibg)"/>`;

const BLUE = '#55aaff';
// Scale icon elements to ~82% centered at (36,36)
const SC = 'translate(36,36) scale(0.82) translate(-36,-36)';

const SPEAKER = `<path d="M9 28 L9 44 L21 44 L38 54 L38 18 L21 28 Z" fill="white"/>`;

export function tuneSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
${BG}
<g transform="${SC}">
<line x1="36" y1="20" x2="36" y2="52" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
<line x1="28" y1="60" x2="36" y2="52" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
<line x1="44" y1="60" x2="36" y2="52" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
<circle cx="36" cy="18" r="2.5" fill="${BLUE}"/>
<path d="M27 27 Q36 17 45 27" fill="none" stroke="${BLUE}" stroke-width="2.2" stroke-linecap="round"/>
<path d="M22 22 Q36 9 50 22" fill="none" stroke="${BLUE}" stroke-width="2" stroke-linecap="round" opacity="0.75"/>
<path d="M17 17 Q36 1 55 17" fill="none" stroke="${BLUE}" stroke-width="1.8" stroke-linecap="round" opacity="0.45"/>
</g>
</svg>`;
}

export function volUpSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
${BG}
<g transform="${SC}">
${SPEAKER}
<polyline points="44,46 53,28 62,46" fill="none" stroke="${BLUE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
</g>
</svg>`;
}

export function volDownSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
${BG}
<g transform="${SC}">
${SPEAKER}
<polyline points="44,26 53,44 62,26" fill="none" stroke="${BLUE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
</g>
</svg>`;
}

export function muteSvg(muted: boolean): string {
  const waves = `<path d="M42 29 A7 7 0 0 1 42 43" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
<path d="M47 23 A13 13 0 0 1 47 49" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round"/>`;
  const cross = `<line x1="44" y1="25" x2="62" y2="43" stroke="#ff4444" stroke-width="3" stroke-linecap="round"/>
<line x1="62" y1="25" x2="44" y2="43" stroke="#ff4444" stroke-width="3" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
${BG}
<g transform="${SC}">
${SPEAKER}
${muted ? cross : waves}
</g>
</svg>`;
}

export function statusPanelSvg(s: AtsStatus, selectedRow = -1, editMode = false, borderSide: 'left' | 'right' | 'none' = 'none'): string {
  const rows: [string, string][] = [
    ['Step', s.step],
    ['BW',   s.bandwidth],
    [s.agc === 0 ? 'AGC' : 'Att', s.agc === 0 ? 'On' : String(s.agc - 1).padStart(2, '0')],
    ['Vol',  String(s.volume)],
    ['AVC',  s.avc === 0 ? 'n/a' : `${s.avc}dB`],
  ];
  const items = rows.map(([label, value], i) => {
    const y = 17 + i * 17;
    const isSelected = i === selectedRow;
    const isEdit = isSelected && editMode;
    const accent = isEdit ? '#ffaa55' : BLUE;
    const bg  = isSelected ? `<rect x="0" y="${y - 14}" width="200" height="17" fill="#222222"/>` : '';
    const bar = isSelected ? `<rect x="0" y="${y - 14}" width="3" height="17" fill="${accent}"/>` : '';
    return `${bg}${bar}
<text x="8" y="${y}" fill="${isSelected ? accent : 'white'}" font-size="12" font-family="monospace">${label}</text>
<text x="192" y="${y}" fill="${isSelected && !isEdit ? '#ffee00' : 'white'}" font-size="14" font-family="monospace" text-anchor="end">${value}</text>`;
  }).join('\n');
  const C = '#888888';
  const border = borderSide === 'none' ? '' : [
    `<line x1="0" y1="0" x2="200" y2="0" stroke="${C}" stroke-width="1"/>`,
    `<line x1="0" y1="91" x2="200" y2="91" stroke="${C}" stroke-width="1"/>`,
    borderSide === 'left'
      ? `<line x1="0" y1="0" x2="0" y2="92" stroke="${C}" stroke-width="1"/>`
      : `<line x1="199" y1="0" x2="199" y2="92" stroke="${C}" stroke-width="1"/>`,
  ].join('');
  return `<svg width="200" height="92" xmlns="http://www.w3.org/2000/svg">
<rect width="200" height="92" fill="#000000"/>
<line x1="62" y1="6" x2="62" y2="87" stroke="#2a2a2a" stroke-width="1"/>
${items}
${border}
</svg>`;
}

export function displaySvg(on: boolean): string {
  const screenFill  = on ? '#aaddff' : '#111111';
  const frameFill   = on ? '#445566' : '#333333';
  const frameStroke = on ? '#88aacc' : '#555555';
  const extra = on
    ? `<text x="36" y="37" font-family="monospace" font-size="11" fill="#003366" text-anchor="middle" font-weight="700">LCD</text>`
    : `<line x1="27" y1="23" x2="45" y2="37" stroke="#555" stroke-width="2.5" stroke-linecap="round"/>
       <line x1="45" y1="23" x2="27" y2="37" stroke="#555" stroke-width="2.5" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
${BG}
<g transform="${SC}">
<rect x="9" y="11" width="54" height="40" rx="4" fill="${frameFill}" stroke="${frameStroke}" stroke-width="1.5"/>
<rect x="13" y="15" width="46" height="32" rx="1.5" fill="${screenFill}"/>
${extra}
<rect x="29" y="51" width="14" height="7" fill="${frameFill}"/>
<rect x="22" y="57" width="28" height="4" rx="2" fill="${frameFill}"/>
</g>
</svg>`;
}

export function knobSvg(): string {
  const cx = 36, cy = 36, N = 60;
  const outerR = 34, toothH = 4, toothW = 2.2;
  const innerR = outerR - toothH;
  let teeth = '';
  for (let i = 0; i < N; i++) {
    const deg = i * 360 / N;
    const rad = deg * Math.PI / 180;
    const tx = cx + innerR * Math.sin(rad);
    const ty = cy - innerR * Math.cos(rad);
    teeth += `<rect x="${(tx-toothW/2).toFixed(2)}" y="${(ty-toothH/2).toFixed(2)}" width="${toothW}" height="${toothH}" rx="0.5" fill="#3a3a3a" transform="rotate(${deg.toFixed(1)},${tx.toFixed(2)},${ty.toFixed(2)})"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
<defs>
  <radialGradient id="kg" cx="38%" cy="32%" r="65%">
    <stop offset="0%" stop-color="#505050"/>
    <stop offset="60%" stop-color="#2a2a2a"/>
    <stop offset="100%" stop-color="#141414"/>
  </radialGradient>
  <radialGradient id="ks" cx="50%" cy="50%" r="50%">
    <stop offset="70%" stop-color="transparent"/>
    <stop offset="100%" stop-color="#000000" stop-opacity="0.5"/>
  </radialGradient>
</defs>
<circle cx="${cx}" cy="${cy}" r="35" fill="#0d0d0d"/>
${teeth}
<circle cx="${cx}" cy="${cy}" r="${innerR-0.5}" fill="url(#kg)"/>
<circle cx="${cx}" cy="${cy}" r="${innerR-0.5}" fill="url(#ks)"/>
<circle cx="${cx}" cy="13" r="2" fill="white" opacity="0.85"/>
</svg>`;
}
