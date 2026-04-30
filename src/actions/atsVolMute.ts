import { action, KeyAction, KeyUpEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from '@elgato/streamdeck';
import streamDeck from '@elgato/streamdeck';
import { atsService } from '../atsService.js';
import { svgB64, muteSvg } from '../icons.js';

@action({ UUID: 'com.hogehoge.ats-mini.vol-mute' })
export class AtsVolMute extends SingletonAction {
  private muted = false;
  private reconnectFn: (() => void) | null = null;

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    const key = ev.action as KeyAction;
    this.reconnectFn = () => {
      if (this.muted) {
        streamDeck.logger.info('[atsVolMute] reconnected: reset mute state');
        this.muted = false;
        key.setImage(svgB64(muteSvg(false))).catch(() => {});
      }
    };
    atsService.onConnect(this.reconnectFn);
    atsService.connect().catch(() => {});
    await key.setImage(svgB64(muteSvg(this.muted)));
    await key.setTitle('');
  }

  override onWillDisappear(_ev: WillDisappearEvent): void {
    if (this.reconnectFn) { atsService.offConnect(this.reconnectFn); this.reconnectFn = null; }
  }

  override async onKeyUp(ev: KeyUpEvent): Promise<void> {
    const key = ev.action as KeyAction;
    atsService.send('Q');
    this.muted = !this.muted;
    streamDeck.logger.info(`[atsVolMute] sent Q, muted=${this.muted}`);
    await key.setImage(svgB64(muteSvg(this.muted)));
    await key.showOk();
  }
}
