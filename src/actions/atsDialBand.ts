import { action, DialRotateEvent, SingletonAction, WillAppearEvent, WillDisappearEvent, DidReceiveSettingsEvent } from '@elgato/streamdeck';
import { atsService } from '../atsService.js';
import { AtsStatus } from '../AtsSerial.js';
import { knobSvg, svgB64 } from '../icons.js';
import { makeBorderSvg } from '../dialDisplay.js';

// Firmware band list (Menu.cpp order) — used for optimistic display update
const BAND_LIST: Array<{ name: string; mode: string }> = [
  { name: 'VHF',  mode: 'FM'  },
  { name: 'ALL',  mode: 'AM'  },
  { name: '11M',  mode: 'AM'  },
  { name: '13M',  mode: 'AM'  },
  { name: '15M',  mode: 'AM'  },
  { name: '16M',  mode: 'AM'  },
  { name: '19M',  mode: 'AM'  },
  { name: '22M',  mode: 'AM'  },
  { name: '25M',  mode: 'AM'  },
  { name: '31M',  mode: 'AM'  },
  { name: '41M',  mode: 'AM'  },
  { name: '49M',  mode: 'AM'  },
  { name: '60M',  mode: 'AM'  },
  { name: '75M',  mode: 'AM'  },
  { name: '90M',  mode: 'AM'  },
  { name: 'MW3',  mode: 'AM'  },
  { name: 'MW2',  mode: 'AM'  },
  { name: 'MW1',  mode: 'AM'  },
  { name: '160M', mode: 'LSB' },
  { name: '80M',  mode: 'LSB' },
  { name: '40M',  mode: 'LSB' },
  { name: '30M',  mode: 'LSB' },
  { name: '20M',  mode: 'USB' },
  { name: '17M',  mode: 'USB' },
  { name: '15M',  mode: 'USB' },
  { name: '12M',  mode: 'USB' },
  { name: '10M',  mode: 'USB' },
  { name: 'CB',   mode: 'AM'  },
];
const N_BANDS = BAND_LIST.length;

function getBandType(band: string): string {
  if (band === 'VHF') return 'FM';
  if (band === 'MW1' || band === 'MW2' || band === 'MW3' || band === '160M') return 'MW';
  return 'SW';
}

function bandHeaderSvg(): string {
  return svgB64(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="14"><text x="100" y="11" font-family="monospace" font-size="12" fill="white" text-anchor="middle">── BAND ──</text></svg>`);
}

function bandCenterSvg(band: string, type: string, mode: string): string {
  const f = `font-family="monospace"`;
  const y = 46;
  if (band !== '---' && type && mode) {
    return svgB64(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="74">` +
      `<text x="42"  y="${y}" ${f} font-size="22" fill="white"   text-anchor="middle">${band}</text>` +
      `<text x="115" y="${y}" ${f} font-size="17" fill="#aaaaaa" text-anchor="middle">${type}</text>` +
      `<text x="172" y="${y}" ${f} font-size="17" fill="#aaaaaa" text-anchor="middle">${mode}</text>` +
      `</svg>`
    );
  }
  return svgB64(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="74"><text x="100" y="${y}" ${f} font-size="22" fill="white" text-anchor="middle">${band}</text></svg>`);
}

type DialBandSettings = { borderSide?: 'left' | 'right' | 'center' | 'none' };

@action({ UUID: 'com.hogehoge.ats-mini.dial-band' })
export class AtsDialBand extends SingletonAction<DialBandSettings> {
  private borderSide: 'left' | 'right' | 'center' | 'none' = 'none';
  private currentBand = '';
  private currentMode = 'AM';
  private currentBandIdx = -1;
  private statusListener: ((s: AtsStatus) => void) | null = null;
  private lastAction: unknown = null;

  override async onWillAppear(ev: WillAppearEvent<DialBandSettings>): Promise<void> {
    this.borderSide = ev.payload.settings.borderSide ?? 'none';
    this.lastAction = ev.action;

    this.statusListener = (s: AtsStatus) => {
      this.currentBand = s.band;
      this.currentMode = s.mode;
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
    await action.setFeedback({
      'header':       bandHeaderSvg(),
      'band-display': bandCenterSvg(band, type, this.currentMode),
      'border':       makeBorderSvg(this.borderSide),
    });
  }
}
