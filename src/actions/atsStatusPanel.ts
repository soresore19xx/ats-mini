import { action, SingletonAction, WillAppearEvent, WillDisappearEvent, DialRotateEvent, DialDownEvent, DialUpEvent, DidReceiveSettingsEvent } from '@elgato/streamdeck';
import { atsService } from '../atsService.js';
import type { AtsStatus } from '../AtsSerial.js';
import { svgB64, statusPanelSvg, knobSvg } from '../icons.js';

type AtsStatusPanelSettings = { borderSide?: 'left' | 'right' | 'center' | 'none' };

const SELECTABLE = [0, 1, 2, 3, 4];
const CMDS: [string, string][] = [
  ['S', 's'], // Step
  ['W', 'w'], // BW
  ['A', 'a'], // AGC/Att
  ['V', 'v'], // Vol
  ['N', 'n'], // AVC
];

@action({ UUID: 'com.hogehoge.ats-mini.status-panel' })
export class AtsStatusPanel extends SingletonAction<AtsStatusPanelSettings> {
  private statusFn: ((s: AtsStatus) => void) | null = null;
  private lastStatus: AtsStatus | null = null;
  private selectedIdx = 0; // index into SELECTABLE[]
  private editMode = false;
  private focused = false;
  private borderSide: 'left' | 'right' | 'center' | 'none' = 'none';
  private act: any = null;

  override async onWillAppear(ev: WillAppearEvent<AtsStatusPanelSettings>): Promise<void> {
    this.act = ev.action as any;
    this.borderSide = ev.payload.settings.borderSide ?? 'none';
    this.statusFn = (s: AtsStatus) => {
      this.lastStatus = s;
      this.render();
    };
    atsService.subscribe(this.statusFn);
    atsService.connect().catch(() => {});
    await (ev.action as any).setImage(svgB64(knobSvg()));
  }

  override onWillDisappear(_ev: WillDisappearEvent): void {
    if (this.statusFn) { atsService.unsubscribe(this.statusFn); this.statusFn = null; }
    this.act = null;
  }

  override onDidReceiveSettings(ev: DidReceiveSettingsEvent<AtsStatusPanelSettings>): void {
    this.borderSide = ev.payload.settings.borderSide ?? 'none';
    this.render();
  }

  override onDialRotate(ev: DialRotateEvent): void {
    const ticks = ev.payload.ticks;
    if (this.editMode) {
      const [upCmd, downCmd] = CMDS[this.selectedIdx];
      const count = Math.abs(ticks);
      const cmd = ticks > 0 ? upCmd : downCmd;
      for (let i = 0; i < count; i++) atsService.send(cmd);
    } else {
      this.focused = true;
      this.selectedIdx = ((this.selectedIdx + (ticks > 0 ? 1 : -1)) + SELECTABLE.length) % SELECTABLE.length;
      this.render();
    }
  }

  override onDialDown(_ev: DialDownEvent): void {}

  override onDialUp(_ev: DialUpEvent): void {
    if (this.editMode) {
      this.editMode = false;
      this.focused = false;
    } else {
      this.editMode = true;
      this.focused = true;
    }
    this.render();
  }

  private render(): void {
    if (!this.act || !this.lastStatus) return;
    const row = this.focused ? SELECTABLE[this.selectedIdx] : -1;
    this.act.setFeedback({
      'status-display': svgB64(statusPanelSvg(this.lastStatus, row, this.editMode, this.borderSide)),
    }).catch(() => {});
  }
}
