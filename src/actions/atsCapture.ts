import { action, KeyAction, KeyUpEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import streamDeck from '@elgato/streamdeck';
import { atsService } from '../atsService.js';

@action({ UUID: 'com.hogehoge.ats-mini.capture' })
export class AtsCapture extends SingletonAction {
  override onWillAppear(_ev: WillAppearEvent): void {
    atsService.connect().catch(() => {});
  }

  override async onKeyUp(ev: KeyUpEvent): Promise<void> {
    const key = ev.action as KeyAction;
    await key.setTitle('...');
    try {
      const path = await atsService.capture();
      const filename = path.split('/').pop() ?? path;
      streamDeck.logger.info(`[atsCapture] saved: ${path}`);
      await key.setTitle('Saved');
      await key.showOk();
      setTimeout(() => key.setTitle('Capture').catch(() => {}), 2000);
    } catch (e) {
      streamDeck.logger.error(`[atsCapture] failed: ${e}`);
      await key.setTitle('Error');
      await key.showAlert();
      setTimeout(() => key.setTitle('Capture').catch(() => {}), 2000);
    }
  }
}
