import { action, KeyAction, KeyUpEvent, SingletonAction, WillAppearEvent, WillDisappearEvent, DidReceiveSettingsEvent, SendToPluginEvent } from '@elgato/streamdeck';
import streamDeck from '@elgato/streamdeck';
import type { JsonObject } from '@elgato/utils';
import { atsService } from '../atsService.js';
import { AtsStatus, Memory, formatFreq } from '../AtsSerial.js';
import { svgB64, tuneSvg } from '../icons.js';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const MEMORIES_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'memories.json');

type TuneSettings = { slot?: number };

async function loadMemories(): Promise<Memory[]> {
  const raw = await readFile(MEMORIES_PATH, 'utf8');
  return JSON.parse(raw) as Memory[];
}

let memoriesCache: Memory[] | null = null;
async function getMemory(slot: number): Promise<Memory | null> {
  if (!memoriesCache) memoriesCache = await loadMemories();
  // slots are 1-based; empty slots have freq=0
  const m = memoriesCache[slot - 1];
  return m?.freq ? m : null;
}

function slotTitle(m: Memory | null, slot: number): string {
  if (!m) return `#${slot}\n---`;
  return `#${slot}\n${formatFreq(m.freq, m.mode)}`;
}

@action({ UUID: 'com.hogehoge.ats-mini.tune' })
export class AtsTune extends SingletonAction<TuneSettings> {
  private listeners = new Map<string, (s: AtsStatus) => void>();

  override async onWillAppear(ev: WillAppearEvent<TuneSettings>): Promise<void> {
    const slot = ev.payload.settings.slot ?? 1;
    streamDeck.logger.info(`[atsTune] onWillAppear slot=${slot}`);
    const m = await getMemory(slot);
    await (ev.action as KeyAction<TuneSettings>).setImage(svgB64(tuneSvg()));
    await ev.action.setTitle(slotTitle(m, slot));

    const listener = (_s: AtsStatus) => {};
    this.listeners.set(ev.action.id, listener);
    atsService.subscribe(listener);
    atsService.connect().catch((e) => streamDeck.logger.error(`[atsTune] connect error: ${e}`));
  }

  override onWillDisappear(ev: WillDisappearEvent<TuneSettings>): void {
    const fn = this.listeners.get(ev.action.id);
    if (fn) { atsService.unsubscribe(fn); this.listeners.delete(ev.action.id); }
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<TuneSettings>): Promise<void> {
    const slot = ev.payload.settings.slot ?? 1;
    const m = await getMemory(slot);
    await ev.action.setTitle(slotTitle(m, slot));
  }

  override async onKeyUp(ev: KeyUpEvent<TuneSettings>): Promise<void> {
    const slot = ev.payload.settings.slot ?? 1;
    streamDeck.logger.info(`[atsTune] onKeyUp slot=${slot}`);
    const m = await getMemory(slot);
    if (!m) { streamDeck.logger.warn(`[atsTune] no memory for slot ${slot}`); return; }
    streamDeck.logger.info(`[atsTune] tuning freq=${m.freq} mode=${m.mode}`);
    atsService.tune(m.freq, m.mode);
    await (ev.action as KeyAction<TuneSettings>).showOk();
  }

  override async onSendToPlugin(ev: SendToPluginEvent<JsonObject, TuneSettings>): Promise<void> {
    if (ev.payload['action'] === 'getMemories') {
      if (!memoriesCache) memoriesCache = await loadMemories();
      await streamDeck.ui.sendToPropertyInspector({
        action: 'memories',
        memories: memoriesCache as unknown as JsonObject[],
      });
    }
  }
}
