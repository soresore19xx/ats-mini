import { action, DialDownEvent, DialRotateEvent, DialUpEvent, SingletonAction, WillAppearEvent, WillDisappearEvent, DidReceiveSettingsEvent } from '@elgato/streamdeck';
import streamDeck from '@elgato/streamdeck';
import { atsService } from '../atsService.js';
import { AtsStatus, Memory } from '../AtsSerial.js';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { knobSvg } from '../icons.js';
import { getStrength, freqParts, seg7svg, makeHeaderSvg, makeBorderSvg, rssiBandSvg, volBarSvg, snrBarSvg } from '../dialDisplay.js';
import { svgB64 } from '../icons.js';

const MEMORIES_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'memories.json');

function parseStepHz(desc: string): number {
  if (desc.endsWith('M')) return parseInt(desc) * 1000000;
  if (desc.endsWith('k')) return parseInt(desc) * 1000;
  return parseInt(desc);
}

type DialTuneSettings = { autoTune?: boolean; vfoMode?: boolean; slotIndex?: number; borderSide?: 'left' | 'right' | 'center' | 'none' };

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
  private borderSide: 'left' | 'right' | 'center' | 'none' = 'none';
  private currentRssi = 0;
  private currentSnr = 0;
  private currentVolume = 0;
  private currentFreq = 0;
  private currentMode = 'AM';
  private currentBand = '';
  private currentStereo = false;
  private currentStep = '9k';
  private vfoMode = false;
  private vfoThrottleTimer: ReturnType<typeof setTimeout> | null = null;
  private vfoTargetFreq = 0;
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
    this.vfoMode   = ev.payload.settings.vfoMode ?? false;
    this.autoTune  = ev.payload.settings.autoTune ?? true;
    this.borderSide = ev.payload.settings.borderSide ?? 'none';
    this.currentIdx = ev.payload.settings.slotIndex ?? 0;
    this.lastAction = ev.action;

    this.statusListener = (s: AtsStatus) => {
      this.currentRssi = s.rssi;
      this.currentSnr = s.snr;
      this.currentVolume = s.volume;
      this.currentMode = s.mode;
      this.currentBand = s.band;
      this.currentStereo = s.stereo;
      this.currentStep   = s.step;
      const deviceFreq = s.freq * (s.mode === 'FM' ? 10000 : 1000);
      if (this.vfoMode && this.vfoTargetFreq > 0) {
        // VFO in-flight: hold currentFreq until device reaches target
        if (Math.abs(deviceFreq - this.vfoTargetFreq) < parseStepHz(this.currentStep)) {
          this.vfoTargetFreq = 0;
          this.currentFreq = deviceFreq;
        }
        // else: don't touch currentFreq — keep the value we're dialing toward
      } else if (!this.vfoMode && Date.now() < this.previewUntil) {
        // preset mode preview: don't overwrite
      } else {
        this.currentFreq = deviceFreq;
      }
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
    this.vfoMode    = ev.payload.settings.vfoMode ?? false;
    this.autoTune   = ev.payload.settings.autoTune ?? true;
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

    if (this.vfoMode) {
      if (this.currentFreq === 0) return;
      const stepHz = parseStepHz(this.currentStep);
      this.currentFreq = Math.max(0, this.currentFreq + ev.payload.ticks * stepHz);
      this.vfoTargetFreq = this.currentFreq;
      await this.updateDisplay(ev.action);
      if (this.vfoThrottleTimer) clearTimeout(this.vfoThrottleTimer);
      this.vfoThrottleTimer = setTimeout(() => {
        this.vfoThrottleTimer = null;
        atsService.tune(this.currentFreq, this.currentMode);
      }, 300);
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
    // VFO mode: always use currentFreq directly (previewUntil only protects currentFreq from status overwrite)
    const preview = !this.vfoMode && Date.now() < this.previewUntil;
    const dispFreq = preview ? m.freq : (this.currentFreq > 0 ? this.currentFreq : m.freq);
    const dispMode = preview ? m.mode : (this.currentFreq > 0 ? this.currentMode : m.mode);
    const dispBand = preview ? m.band : (this.currentFreq > 0 ? this.currentBand : m.band);
    const rssiBar = Math.round(getStrength(this.currentRssi, dispMode) / 17 * 100);
    const snrBar = Math.round(this.currentSnr * 45 / 128 / 49 * 100);
    const { num, unit } = freqParts(dispFreq, dispMode);
    const showStereo = !preview && this.currentStereo;
    const headerLabel = this.vfoMode
      ? `${dispBand} ${dispMode}  VFO`
      : `${dispBand} ${dispMode}`;
    await action.setFeedback({
      header: makeHeaderSvg(headerLabel, showStereo),
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
