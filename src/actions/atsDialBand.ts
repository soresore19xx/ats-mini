import { action, DialRotateEvent, SingletonAction, WillAppearEvent, WillDisappearEvent, DidReceiveSettingsEvent } from '@elgato/streamdeck';
import { atsService } from '../atsService.js';
import { AtsStatus } from '../AtsSerial.js';
import { knobSvg, svgB64 } from '../icons.js';
import { makeBorderSvg } from '../dialDisplay.js';

// Firmware band list (Menu.cpp order) — lo/hi in Hz (AM/LSB/USB: kHz×1000, FM: 10kHz×10000)
const BAND_LIST: Array<{ name: string; type: string; mode: string; lo: number; hi: number }> = [
  { name: 'VHF',  type: 'FM', mode: 'FM',  lo:  64_000_000, hi: 108_000_000 },
  { name: 'ALL',  type: 'SW', mode: 'AM',  lo:     150_000, hi:  30_000_000 },
  { name: '11M',  type: 'SW', mode: 'AM',  lo:  25_600_000, hi:  26_100_000 },
  { name: '13M',  type: 'SW', mode: 'AM',  lo:  21_500_000, hi:  21_900_000 },
  { name: '15M',  type: 'SW', mode: 'AM',  lo:  18_900_000, hi:  19_100_000 },
  { name: '16M',  type: 'SW', mode: 'AM',  lo:  17_400_000, hi:  18_100_000 },
  { name: '19M',  type: 'SW', mode: 'AM',  lo:  15_100_000, hi:  15_900_000 },
  { name: '22M',  type: 'SW', mode: 'AM',  lo:  13_500_000, hi:  13_900_000 },
  { name: '25M',  type: 'SW', mode: 'AM',  lo:  11_000_000, hi:  13_000_000 },
  { name: '31M',  type: 'SW', mode: 'AM',  lo:   9_000_000, hi:  11_000_000 },
  { name: '41M',  type: 'SW', mode: 'AM',  lo:   7_000_000, hi:   9_000_000 },
  { name: '49M',  type: 'SW', mode: 'AM',  lo:   5_000_000, hi:   7_000_000 },
  { name: '60M',  type: 'SW', mode: 'AM',  lo:   4_000_000, hi:   5_100_000 },
  { name: '75M',  type: 'SW', mode: 'AM',  lo:   3_500_000, hi:   4_000_000 },
  { name: '90M',  type: 'SW', mode: 'AM',  lo:   3_000_000, hi:   3_500_000 },
  { name: 'MW3',  type: 'MW', mode: 'AM',  lo:   1_700_000, hi:   3_500_000 },
  { name: 'MW2',  type: 'MW', mode: 'AM',  lo:     495_000, hi:   1_701_000 },
  { name: 'MW1',  type: 'MW', mode: 'AM',  lo:     150_000, hi:   1_800_000 },
  { name: '160M', type: 'MW', mode: 'LSB', lo:   1_800_000, hi:   2_000_000 },
  { name: '80M',  type: 'SW', mode: 'LSB', lo:   3_500_000, hi:   4_000_000 },
  { name: '40M',  type: 'SW', mode: 'LSB', lo:   7_000_000, hi:   7_300_000 },
  { name: '30M',  type: 'SW', mode: 'LSB', lo:  10_000_000, hi:  10_200_000 },
  { name: '20M',  type: 'SW', mode: 'USB', lo:  14_000_000, hi:  14_400_000 },
  { name: '17M',  type: 'SW', mode: 'USB', lo:  18_000_000, hi:  18_200_000 },
  { name: '15M',  type: 'SW', mode: 'USB', lo:  21_000_000, hi:  21_500_000 },
  { name: '12M',  type: 'SW', mode: 'USB', lo:  24_800_000, hi:  25_000_000 },
  { name: '10M',  type: 'SW', mode: 'USB', lo:  28_000_000, hi:  29_700_000 },
  { name: 'CB',   type: 'SW', mode: 'AM',  lo:  25_000_000, hi:  28_000_000 },
];
const N_BANDS = BAND_LIST.length;

function fmtFreqCompact(hz: number): string {
  if (hz >= 1_000_000) {
    const mhz = Math.round(hz / 100_000) / 10;
    return mhz === Math.floor(mhz) ? `${mhz}M` : `${mhz.toFixed(1)}M`;
  }
  return `${hz / 1000}k`;
}

function bandHeaderSvg(): string {
  return svgB64(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="14"><text x="100" y="11" font-family="monospace" font-size="12" fill="white" text-anchor="middle">── BAND ──</text></svg>`);
}

function bandCenterSvg(band: string, type: string, mode: string): string {
  const f = `font-family="monospace"`;
  const y = 34;
  if (band !== '---' && type && mode) {
    return svgB64(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="52">` +
      `<rect x="${42 - Math.round(band.length * 7 + 8)}" y="14" width="${Math.round(band.length * 14 + 16)}" height="24" rx="3" fill="none" stroke="white" stroke-width="1.5"/>` +
      `<text x="42"  y="${y}" ${f} font-size="22" fill="white"   text-anchor="middle">${band}</text>` +
      `<text x="115" y="${y}" ${f} font-size="17" fill="#aaaaaa" text-anchor="middle">${type}</text>` +
      `<text x="172" y="${y}" ${f} font-size="17" fill="#aaaaaa" text-anchor="middle">${mode}</text>` +
      `</svg>`
    );
  }
  return svgB64(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="52"><text x="100" y="${y}" ${f} font-size="22" fill="white" text-anchor="middle">${band}</text></svg>`);
}

function bandRangeSvg(lo: number, hi: number, currentFreq: number): string {
  const loStr = fmtFreqCompact(lo);
  const hiStr = fmtFreqCompact(hi);
  const charW = 9, MARGIN = 2, GAP = 3, CR = 3, lineY = 10, TY = 14;
  const loX   = MARGIN;
  const hiX   = Math.round(200 - MARGIN - hiStr.length * charW);
  const BAR_X  = Math.round(loX + loStr.length * charW + GAP + CR);
  const BAR_END = hiX - GAP - CR;
  const BAR_W  = BAR_END - BAR_X;
  let out = `<line x1="${BAR_X}" y1="${lineY}" x2="${BAR_END}" y2="${lineY}" stroke="white" stroke-width="1" stroke-dasharray="1,1"/>`;
  out += `<circle cx="${BAR_X}" cy="${lineY}" r="3" fill="none" stroke="white" stroke-width="1"/>`;
  out += `<circle cx="${BAR_END}" cy="${lineY}" r="3" fill="none" stroke="white" stroke-width="1"/>`;
  if (currentFreq > 0 && currentFreq >= lo && currentFreq <= hi && hi > lo && BAR_W > 0) {
    const mx = BAR_X + Math.max(2, Math.min(BAR_W - 2, Math.round((currentFreq - lo) / (hi - lo) * BAR_W)));
    out += `<circle cx="${mx}" cy="${lineY}" r="3" fill="#ff4444"/>`;
  }
  out += `<text x="${loX}" y="${TY}" font-family="monospace" font-size="12" fill="white">${loStr}</text>`;
  out += `<text x="${hiX}" y="${TY - 1}" font-family="monospace" font-size="12" fill="white">${hiStr}</text>`;
  return svgB64(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="20">${out}</svg>`);
}

type DialBandSettings = { borderSide?: 'left' | 'right' | 'center' | 'none' };

@action({ UUID: 'com.hogehoge.ats-mini.dial-band' })
export class AtsDialBand extends SingletonAction<DialBandSettings> {
  private borderSide: 'left' | 'right' | 'center' | 'none' = 'none';
  private currentBand = '';
  private currentMode = 'AM';
  private currentFreq = 0;
  private currentBandIdx = -1;
  private statusListener: ((s: AtsStatus) => void) | null = null;
  private lastAction: unknown = null;

  override async onWillAppear(ev: WillAppearEvent<DialBandSettings>): Promise<void> {
    this.borderSide = ev.payload.settings.borderSide ?? 'none';
    this.lastAction = ev.action;

    this.statusListener = (s: AtsStatus) => {
      this.currentBand = s.band;
      this.currentMode = s.mode;
      this.currentFreq = s.freq * (s.mode === 'FM' ? 10000 : 1000);
      // sync band index (handle duplicate 15M by matching mode too)
      let idx = BAND_LIST.findIndex(b => b.name === s.band && b.mode === s.mode);
      if (idx < 0) idx = BAND_LIST.findIndex(b => b.name === s.band);
      if (idx >= 0) this.currentBandIdx = idx;
      this.updateDisplay(this.lastAction).catch(() => {});
    };
    atsService.subscribe(this.statusListener);
    atsService.connect().catch(() => {});
    await ev.action.setImage(svgB64(knobSvg()));
    await this.updateDisplay(ev.action);
  }

  override onWillDisappear(_ev: WillDisappearEvent<DialBandSettings>): void {
    if (this.statusListener) {
      atsService.unsubscribe(this.statusListener);
      this.statusListener = null;
    }
    this.lastAction = null;
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<DialBandSettings>): Promise<void> {
    this.borderSide = ev.payload.settings.borderSide ?? 'none';
    await this.updateDisplay(ev.action);
  }

  override async onDialRotate(ev: DialRotateEvent<DialBandSettings>): Promise<void> {
    const ticks = ev.payload.ticks;
    // optimistic update: immediately reflect the predicted band
    if (this.currentBandIdx >= 0) {
      this.currentBandIdx = ((this.currentBandIdx + ticks) % N_BANDS + N_BANDS) % N_BANDS;
      this.currentBand = BAND_LIST[this.currentBandIdx].name;
      this.currentMode = BAND_LIST[this.currentBandIdx].mode;
      this.currentFreq = 0; // reset until status packet confirms actual frequency
      await this.updateDisplay(ev.action);
    }
    if (ticks > 0) for (let i = 0; i < ticks;  i++) atsService.send('B');
    else           for (let i = 0; i < -ticks; i++) atsService.send('b');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async updateDisplay(action: any): Promise<void> {
    if (!action) return;
    const band = this.currentBand || '---';
    const entry = this.currentBandIdx >= 0 ? BAND_LIST[this.currentBandIdx] : null;
    const type = entry ? entry.type : '';
    const rangeSvg = entry
      ? bandRangeSvg(entry.lo, entry.hi, this.currentFreq)
      : bandRangeSvg(0, 1, 0);
    await action.setFeedback({
      'header':       bandHeaderSvg(),
      'band-display': bandCenterSvg(band, type, this.currentMode),
      'freq-range':   rangeSvg,
      'border':       makeBorderSvg(this.borderSide),
    });
  }
}
