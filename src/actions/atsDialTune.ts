import { action, DialDownEvent, DialRotateEvent, DialUpEvent, SingletonAction, WillAppearEvent, WillDisappearEvent, DidReceiveSettingsEvent } from '@elgato/streamdeck';
import streamDeck from '@elgato/streamdeck';
import { atsService } from '../atsService.js';
import { AtsStatus, Memory } from '../AtsSerial.js';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { svgB64, knobSvg } from '../icons.js';

const MEMORIES_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'memories.json');

function getStrength(rssi: number, mode: string): number {
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

function freqParts(freq: number, mode: string): { num: string; unit: string } {
  if (mode === 'FM') return { num: (freq / 1000000).toFixed(1), unit: 'MHz' };
  if (freq >= 1000000) return { num: (freq / 1000).toFixed(0), unit: 'kHz' };
  return { num: String(freq / 1000), unit: 'kHz' };
}

const SEGS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc',     '2': 'abdeg',  '3': 'abcdg',
  '4': 'bcfg',   '5': 'acdfg',  '6': 'acdefg', '7': 'abc',
  '8': 'abcdefg','9': 'abcdfg', '.': '.',       '-': 'g',
};

function seg7svg(numStr: string, unit: string, svgW: number, svgH: number): string {
  const n = (v: number) => v.toFixed(1);
  const DH = svgH * 0.65;
  const DW = DH * 0.56;
  const T  = Math.max(3, DH * 0.10);
  const DOT = T * 1.6;
  const CG = 3;

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
      for (const [id, x, y, w, h] of [
        ['a', cx+T+1,   oy,           DW-2*T-2, T  ],
        ['b', cx+DW-T,  oy+T+1,       T, DH/2-T-2  ],
        ['c', cx+DW-T,  oy+DH/2+1,    T, DH/2-T-2  ],
        ['d', cx+T+1,   oy+DH-T,      DW-2*T-2, T  ],
        ['e', cx,       oy+DH/2+1,    T, DH/2-T-2  ],
        ['f', cx,       oy+T+1,       T, DH/2-T-2  ],
        ['g', cx+T+1,   oy+DH/2-T/2, DW-2*T-2, T  ],
      ] as [string,number,number,number,number][]) {
        out += `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${on.includes(id)?'white':'#1e1e1e'}" rx="1"/>`;
      }
      cx += DW + CG;
    }
  }

  out += `<text x="${n(cx+4)}" y="${n(oy+DH-1)}" font-family="monospace" font-size="${n(unitSize)}" fill="white">${unit}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}">${out}</svg>`;
}

function makeHeaderSvg(label: string, stereo = false): string {
  const charW = 8.5;  // approximate char width for monospace font-size:14
  const textW = label.length * charW;
  const BADGE_W = 44, GAP = 5;
  // with stereo badge: center the text+badge group at x=100
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

function makeBorderSvg(side: 'left' | 'right' | 'none'): string {
  if (side === 'none') return svgB64(`<svg width="200" height="92" xmlns="http://www.w3.org/2000/svg"></svg>`);
  const C = '#888888';
  const top  = `<line x1="0" y1="0" x2="200" y2="0" stroke="${C}" stroke-width="1"/>`;
  const bot  = `<line x1="0" y1="91" x2="200" y2="91" stroke="${C}" stroke-width="1"/>`;
  const vert = side === 'left'
    ? `<line x1="0" y1="0" x2="0" y2="92" stroke="${C}" stroke-width="1"/>`
    : `<line x1="199" y1="0" x2="199" y2="92" stroke="${C}" stroke-width="1"/>`;
  return svgB64(`<svg width="200" height="92" xmlns="http://www.w3.org/2000/svg">${top}${vert}${bot}</svg>`);
}

const SEG_W = 4, SEG_GAP = 1, SEG_STEP = SEG_W + SEG_GAP;
const N_SEGS = 30; // 30 × 5px = 150px

function rssiBandSvg(rssiBar: number): string {
  const W = 150, H = 6;
  const filled = Math.round(rssiBar / 100 * N_SEGS);
  const split = Math.round(10 / 17 * N_SEGS); // S9 boundary ≈ seg 18
  let out = `<rect width="${W}" height="${H}" fill="#111111"/>`;
  for (let i = 0; i < N_SEGS; i++) {
    const x = i * SEG_STEP;
    const color = i < filled ? (i < split ? '#00ff00' : '#ff0000') : '#2a2a2a';
    out += `<rect x="${x}" y="0" width="${SEG_W}" height="${H}" fill="${color}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${out}</svg>`;
}

function volBarSvg(pct: number): string {
  const W = 150, H = 6;
  const fillX = Math.round(W * pct / 100);
  const bg = `<rect width="${W}" height="${H}" fill="#333333" rx="1"/>`;
  if (fillX <= 0) return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${bg}</svg>`;
  const bar = `<rect width="${fillX}" height="${H}" fill="#55aaff" rx="1"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${bg}${bar}</svg>`;
}

function snrBarSvg(pct: number): string {
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

type DialTuneSettings = { autoTune?: boolean; slotIndex?: number; borderSide?: 'left' | 'right' | 'none' };

let memoriesCache: Memory[] | null = null;
async function getMemories(): Promise<Memory[]> {
  if (!memoriesCache) {
    const raw = await readFile(MEMORIES_PATH, 'utf8');
    const all = JSON.parse(raw) as Memory[];
    memoriesCache = all.filter(m => m.freq > 0);
  }
  return memoriesCache;
}

@action({ UUID: 'com.hogehoge.ats-mini.dial-tune' })
export class AtsDialTune extends SingletonAction<DialTuneSettings> {
  private currentIdx = 0;
  private autoTune = true;
  private borderSide: 'left' | 'right' | 'none' = 'none';
  private currentRssi = 0;
  private currentSnr = 0;
  private currentVolume = 0;
  private currentFreq = 0;
  private currentMode = 'AM';
  private currentBand = '';
  private currentStereo = false;
  private previewUntil = 0;
  private statusListener: ((s: AtsStatus) => void) | null = null;
  private lastAction: unknown = null;
  private muted = false;
  private volumeMode = false;
  private lastUpTime = 0;
  private singleClickTimer: ReturnType<typeof setTimeout> | null = null;
  private pressTimer1: ReturnType<typeof setTimeout> | null = null;
  private pressTimer2: ReturnType<typeof setTimeout> | null = null;
  private pendingMute = false;
  private pendingLcd = false;
  private flashUntil = 0;

  override async onWillAppear(ev: WillAppearEvent<DialTuneSettings>): Promise<void> {
    this.autoTune = ev.payload.settings.autoTune ?? true;
    this.borderSide = ev.payload.settings.borderSide ?? 'none';
    this.currentIdx = ev.payload.settings.slotIndex ?? 0;
    this.lastAction = ev.action;

    this.statusListener = (s: AtsStatus) => {
      this.currentRssi = s.rssi;
      this.currentSnr = s.snr;
      this.currentVolume = s.volume;
      this.currentFreq = s.freq * (s.mode === 'FM' ? 10000 : 1000);  // status packet is kHz(AM) or 10kHz(FM) → convert to Hz
      this.currentMode = s.mode;
      this.currentBand = s.band;
      this.currentStereo = s.stereo;
      this.updateDisplay(this.lastAction).catch(() => {});
    };
    atsService.subscribe(this.statusListener);
    atsService.connect().catch(() => {});
    await ev.action.setImage(svgB64(knobSvg()));
    await this.updateDisplay(ev.action);
  }

  override onWillDisappear(_ev: WillDisappearEvent<DialTuneSettings>): void {
    if (this.statusListener) {
      atsService.unsubscribe(this.statusListener);
      this.statusListener = null;
    }
    if (this.singleClickTimer) { clearTimeout(this.singleClickTimer); this.singleClickTimer = null; }
    this.lastAction = null;
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<DialTuneSettings>): Promise<void> {
    this.autoTune = ev.payload.settings.autoTune ?? true;
    this.borderSide = ev.payload.settings.borderSide ?? 'none';
    await this.updateDisplay(ev.action);
  }

  override onDialDown(ev: DialDownEvent<DialTuneSettings>): void {
    this.pendingMute = false;
    this.pendingLcd = false;
    // in VOL MODE long-press timers are not needed (single click exits)
    if (this.volumeMode) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const act = ev.action as any;

    const FLASH_MS = 1200;

    // 1.5s: arm mute + show hint
    this.pressTimer1 = setTimeout(() => {
      this.pressTimer1 = null;
      this.pendingMute = true;
      this.flashUntil = Date.now() + FLASH_MS;
      const nextState = this.muted ? 'Unmute?' : 'Mute?';
      const hint = svgB64(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="54"><text x="100" y="34" font-family="monospace" font-size="20" fill="#ffaa44" text-anchor="middle">${nextState}</text></svg>`);
      act.setFeedback({ 'freq-display': hint });
      setTimeout(() => { this.flashUntil = 0; this.updateDisplay(act).catch(() => {}); }, FLASH_MS);
    }, 1500);

    // 3s: arm LCD toggle + show hint (cancels mute)
    this.pressTimer2 = setTimeout(() => {
      this.pressTimer2 = null;
      this.pendingMute = false;
      this.pendingLcd = true;
      this.flashUntil = Date.now() + FLASH_MS;
      const label = atsService.lcdOn ? 'LCD OFF?' : 'LCD ON?';
      const hint = svgB64(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="54"><text x="100" y="34" font-family="monospace" font-size="20" fill="#55aaff" text-anchor="middle">${label}</text></svg>`);
      act.setFeedback({ 'freq-display': hint });
      setTimeout(() => { this.flashUntil = 0; this.updateDisplay(act).catch(() => {}); }, FLASH_MS);
    }, 3000);
  }

  override async onDialRotate(ev: DialRotateEvent<DialTuneSettings>): Promise<void> {
    if (this.volumeMode) {
      const ticks = ev.payload.ticks;
      if (ticks > 0) atsService.volumeUp(ticks);
      else atsService.volumeDown(-ticks);
      // optimistic update: reflect immediately without waiting for status packet
      this.currentVolume = Math.max(0, Math.min(63, this.currentVolume + ticks));
      await this.updateDisplay(ev.action);
      return;
    }
    const memories = await getMemories();
    if (!memories.length) return;
    this.currentIdx = ((this.currentIdx + ev.payload.ticks) % memories.length + memories.length) % memories.length;
    await ev.action.setSettings({ ...ev.payload.settings, slotIndex: this.currentIdx });
    const m = memories[this.currentIdx];
    if (this.autoTune) {
      // autoTune=on: optimistic update — device tunes and next status packet confirms
      this.currentFreq = m.freq;
      this.currentMode = m.mode;
      this.currentBand = m.band;
      atsService.tune(m.freq, m.mode);
      streamDeck.logger.info(`[atsDialTune] auto-tune: ${m.freq} ${m.mode}`);
    } else {
      // autoTune=off: protect preview for 3s so status packets don't overwrite it
      this.previewUntil = Date.now() + 3000;
    }
    await this.updateDisplay(ev.action);
  }

  override async onDialUp(ev: DialUpEvent<DialTuneSettings>): Promise<void> {
    if (this.pressTimer1) { clearTimeout(this.pressTimer1); this.pressTimer1 = null; }
    if (this.pressTimer2) { clearTimeout(this.pressTimer2); this.pressTimer2 = null; }
    if (this.pendingLcd) {
      this.pendingLcd = false;
      atsService.setLcdOn(!atsService.lcdOn);
      atsService.send(atsService.lcdOn ? 'o' : 'O');
      streamDeck.logger.info(`[atsDialTune] lcd toggle: lcdOn=${atsService.lcdOn}`);
      return;
    }
    if (this.pendingMute) {
      this.pendingMute = false;
      this.muted = !this.muted;
      atsService.send('Q');
      streamDeck.logger.info(`[atsDialTune] mute toggle: muted=${this.muted}`);
      return;
    }

    // VOL MODE: single click exits
    if (this.volumeMode) {
      this.volumeMode = false;
      this.lastUpTime = 0;
      streamDeck.logger.info('[atsDialTune] exit VOL MODE');
      this.flashUntil = Date.now() + 1200;
      const exitFlash = svgB64(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="54"><text x="100" y="34" font-family="monospace" font-size="20" fill="#ffaa44" text-anchor="middle">TUNE MODE</text></svg>`);
      await ev.action.setFeedback({ 'freq-display': exitFlash });
      setTimeout(async () => { this.flashUntil = 0; await this.updateDisplay(ev.action); }, 1200);
      return;
    }

    // TUNE MODE: double-click enters VOL MODE
    const DBLCLICK_MS = 300;
    const now = Date.now();
    if (now - this.lastUpTime < DBLCLICK_MS) {
      this.lastUpTime = 0;
      if (this.singleClickTimer) { clearTimeout(this.singleClickTimer); this.singleClickTimer = null; }
      this.volumeMode = true;
      streamDeck.logger.info('[atsDialTune] enter VOL MODE');
      this.flashUntil = Date.now() + 1200;
      const flash = svgB64(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="54"><text x="100" y="34" font-family="monospace" font-size="20" fill="#55aaff" text-anchor="middle">VOL MODE</text></svg>`);
      await ev.action.setFeedback({ 'freq-display': flash });
      setTimeout(async () => { this.flashUntil = 0; await this.updateDisplay(ev.action); }, 1200);
      return;
    }
    this.lastUpTime = now;

    if (this.autoTune) return;

    // autoTune=off: tune after double-click window expires
    this.singleClickTimer = setTimeout(async () => {
      this.singleClickTimer = null;
      const memories = await getMemories();
      if (!memories.length) return;
      const m = memories[this.currentIdx];
      atsService.tune(m.freq, m.mode);
      streamDeck.logger.info(`[atsDialTune] press-tune: ${m.freq} ${m.mode}`);
    }, DBLCLICK_MS);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async updateDisplay(action: any): Promise<void> {
    if (!action) return;
    if (Date.now() < this.flashUntil) return;

    if (this.volumeMode) {
      const volPct = Math.round(Math.min(this.currentVolume, 63) / 63 * 100);
      await action.setFeedback({
        header: makeHeaderSvg('─── VOL MODE ───'),
        'freq-display': svgB64(seg7svg(String(this.currentVolume), '', 200, 54)),
        'rssi-bar': svgB64(volBarSvg(volPct)),
        'rssi-num': String(this.currentVolume),
        's-label': 'V',
        'border': makeBorderSvg(this.borderSide),
      });
      return;
    }

    const memories = await getMemories();
    if (!memories.length) {
      const noSt = svgB64(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="54"><text x="100" y="33" font-family="monospace" font-size="16" fill="#888888" text-anchor="middle">No stations</text></svg>`);
      await action.setFeedback({ header: makeHeaderSvg(''), 'freq-display': noSt, rssi: 0, 's-label': 'S', 'border': makeBorderSvg(this.borderSide) });
      return;
    }
    const idx = Math.min(this.currentIdx, memories.length - 1);
    const m = memories[idx];
    // during preview window show memory freq; otherwise track actual device frequency
    const preview = Date.now() < this.previewUntil;
    const dispFreq = preview ? m.freq : (this.currentFreq > 0 ? this.currentFreq : m.freq);
    const dispMode = preview ? m.mode : (this.currentFreq > 0 ? this.currentMode : m.mode);
    const dispBand = preview ? m.band : (this.currentFreq > 0 ? this.currentBand : m.band);
    const rssiBar = Math.round(getStrength(this.currentRssi, dispMode) / 17 * 100);
    const snrBar = Math.round(this.currentSnr * 45 / 128 / 49 * 100);
    const { num, unit } = freqParts(dispFreq, dispMode);
    const showStereo = !preview && this.currentStereo;
    await action.setFeedback({
      header: makeHeaderSvg(`${dispBand} ${dispMode}`, showStereo),
      'freq-display': svgB64(seg7svg(num, unit, 200, 54)),
      'snr-bar': svgB64(snrBarSvg(snrBar)),
      'snr-num': `${this.currentSnr}dB`,
      'rssi-bar': svgB64(rssiBandSvg(rssiBar)),
      'rssi-num': `${this.currentRssi}dB`,
      's-label': 'S',
      'border': makeBorderSvg(this.borderSide),
    });
  }
}
