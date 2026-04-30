import { action, KeyAction, KeyUpEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from '@elgato/streamdeck';
import { atsService } from '../atsService.js';
import { svgB64, displaySvg } from '../icons.js';

@action({ UUID: 'com.hogehoge.ats-mini.display-toggle' })
export class AtsDisplayToggle extends SingletonAction {
  private reconnectFn: (() => void) | null = null;

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    const key = ev.action as KeyAction;
    this.reconnectFn = () => {
      key.setImage(svgB64(displaySvg(atsService.lcdOn))).catch(() => {});
      key.setTitle('').catch(() => {});
    };
    atsService.onConnect(this.reconnectFn);
    atsService.connect().catch(() => {});
    await key.setImage(svgB64(displaySvg(atsService.lcdOn)));
    await key.setTitle('');
  }

  override onWillDisappear(_ev: WillDisappearEvent): void {
    if (this.reconnectFn) { atsService.offConnect(this.reconnectFn); this.reconnectFn = null; }
  }

  override async onKeyUp(ev: KeyUpEvent): Promise<void> {
    const key = ev.action as KeyAction;
    atsService.setLcdOn(!atsService.lcdOn);
    atsService.send(atsService.lcdOn ? 'o' : 'O');
    await key.setImage(svgB64(displaySvg(atsService.lcdOn)));
    await key.showOk();
  }
}
