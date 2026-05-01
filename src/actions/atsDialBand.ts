import { action, DialRotateEvent, SingletonAction, WillAppearEvent, WillDisappearEvent, DidReceiveSettingsEvent } from '@elgato/streamdeck';
import { atsService } from '../atsService.js';
import { AtsStatus } from '../AtsSerial.js';
import { knobSvg, svgB64 } from '../icons.js';
import { makeBorderSvg } from '../dialDisplay.js';

// Firmware band list (Menu.cpp order) — lo/hi in Hz (AM/LSB/USB: kHz×1000, FM: 10kHz×10000)
const BAND_LIST: Array<{ name: string; mode: string; lo: number; hi: number }> = [
  { name: 'VHF',  mode: 'FM',  lo:  64_000_000, hi: 108_000_000 },
  { name: 'ALL',  mode: 'AM',  lo:     150_000, hi:  30_000_000 },
  { name: '11M',  mode: 'AM',  lo:  25_600_000, hi:  26_100_000 },
  { name: '13M',  mode: 'AM',  lo:  21_500_000, hi:  21_900_000 },
  { name: '15M',  mode: 'AM',  lo:  18_900_000, hi:  19_100_000 },
  { name: '16M',  mode: 'AM',  lo:  17_400_000, hi:  18_100_000 },
  { name: '19M',  mode: 'AM',  lo:  15_100_000, hi:  15_900_000 },
  { name: '22M',  mode: 'AM',  lo:  13_500_000, hi:  13_900_000 },
  { name: '25M',  mode: 'AM',  lo:  11_000_000, hi:  13_000_000 },
  { name: '31M',  mode: 'AM',  lo:   9_000_000, hi:  11_000_000 },
  { name: '41M',  mode: 'AM',  lo:   7_000_000, hi:   9_000_000 },
  { name: '49M',  mode: 'AM',  lo:   5_000_000, hi:   7_000_000 },
  { name: '60M',  mode: 'AM',  lo:   4_000_000, hi:   5_100_000 },
  { name: '75M',  mode: 'AM',  lo:   3_500_000, hi:   4_000_000 },
  { name: '90M',  mode: 'AM',  lo:   3_000_000, hi:   3_500_000 },
  { name: 'MW3',  mode: 'AM',  lo:   1_700_000, hi:   3_500_000 },
  { name: 'MW2',  mode: 'AM',  lo:     495_000, hi:   1_701_000 },
  { name: 'MW1',  mode: 'AM',  lo:     150_000, hi:   1_800_000 },
  { name: '160M', mode: 'LSB', lo:   1_800_000, hi:   2_000_000 },
  { name: '80M',  mode: 'LSB', lo:   3_500_000, hi:   4_000_000 },
  { name: '40M',  mode: 'LSB', lo:   7_000_000, hi:   7_300_000 },
  { name: '30M',  mode: 'LSB', lo:  10_000_000, hi:  10_200_000 },
  { name: '20M',  mode: 'USB', lo:  14_000_000, hi:  14_400_000 },
  { name: '17M',  mode: 'USB', lo:  18_000_000, hi:  18_200_000 },
  { name: '15M',  mode: 'USB', lo:  21_000_000, hi:  21_500_000 },
  { name: '12M',  mode: 'USB', lo:  24_800_000, hi:  25_000_000 },
  { name: '10M',  mode: 'USB', lo:  28_000_000, hi:  29_700_000 },
  { name: 'CB',   mode: 'AM',  lo:  25_000_000, hi:  28_000_000 },
];
const N_BANDS = BAND_LIST.length;

function getBandType(band: string): string {
  if (band === 'VHF') return 'FM';
  if (band === 'MW1' || band === 'MW2' || band === 'MW3' || band === '160M') return 'MW';
  return 'SW';
}

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
  let out = `<rect x="0" y="6" width="200" height="4" fill="#1e1e1e" rx="1"/>`;
  if (currentFreq > 0 && currentFreq >= lo && currentFreq <= hi && hi > lo) {
    const mx = Math.max(1, Math.min(199, Math.round((currentFreq - lo) / (hi - lo) * 200)));
    out += `<rect x="${mx - 1}" y="4" width="2" height="8" fill="#55aaff" rx="0.5"/>`;
  }
  out += `<text x="2" y="19" font-family="monospace" font-size="10" fill="#666666">${loStr}</text>`;
  out += `<text x="198" y="19" font-family="monospace" font-size="10" fill="#666666" text-anchor="end">${hiStr}</text>`;
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
    const type = this.currentBand ? getBandType(this.currentBand) : '';
    const entry = this.currentBandIdx >= 0 ? BAND_LIST[this.currentBandIdx] : null;
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
