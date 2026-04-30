import { action, KeyAction, KeyDownEvent, KeyUpEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import { atsService } from '../atsService.js';
import { svgB64, volUpSvg } from '../icons.js';

const INTERVAL_MS = 150;

@action({ UUID: 'com.hogehoge.ats-mini.vol-up' })
export class AtsVolUp extends SingletonAction {
  private isPressed = false;

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    atsService.connect().catch(() => {});
    await (ev.action as KeyAction).setImage(svgB64(volUpSvg()));
    await (ev.action as KeyAction).setTitle('');
  }

  override onKeyDown(_ev: KeyDownEvent): void {
    if (this.isPressed) return;
    this.isPressed = true;
    this.loop();
  }

  private loop(): void {
    if (!this.isPressed) return;
    atsService.volumeUp(1);
    setTimeout(() => this.loop(), INTERVAL_MS);
  }

  override onKeyUp(_ev: KeyUpEvent): void {
    this.isPressed = false;
  }
}
