import streamDeck from '@elgato/streamdeck';
import { writeFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { AtsSerial, AtsStatus } from './AtsSerial.js';

type StatusListener = (s: AtsStatus) => void;
type ConnectListener = () => void;

class AtsService {
  private serial = new AtsSerial();
  private listeners = new Set<StatusListener>();
  private connectListeners = new Set<ConnectListener>();
  private connected = false;
  private connecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private statusCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private statusReceived = false;
  private _lcdOn = true;

  get lcdOn(): boolean { return this._lcdOn; }
  setLcdOn(v: boolean): void { this._lcdOn = v; }

  constructor() {
    this.serial.on('status', (s: AtsStatus) => {
      if (!this.statusReceived) {
        this.statusReceived = true;
        if (this.statusCheckTimer) { clearTimeout(this.statusCheckTimer); this.statusCheckTimer = null; }
        streamDeck.logger.info('[atsService] status flow confirmed');
      }
      for (const fn of this.listeners) fn(s);
    });
    this.serial.on('error', (e: unknown) => {
      streamDeck.logger.error(`[atsService] serial error: ${e}`);
      this.scheduleReconnect();
    });
  }

  async connect(): Promise<void> {
    if (this.connected || this.connecting) return;
    this.connecting = true;
    try {
      streamDeck.logger.info('[atsService] connecting...');
      await this.serial.connect();
      this.connected = true;
      this._lcdOn = true;
      streamDeck.logger.info('[atsService] connected');
      this.statusReceived = false;
      this.serial.toggleStatus();
      // 't' is a toggle; if no status arrives within 1s it was OFF — send 't' again to turn it ON
      this.statusCheckTimer = setTimeout(() => {
        this.statusCheckTimer = null;
        if (!this.statusReceived) {
          streamDeck.logger.info('[atsService] no status received, re-toggling');
          this.serial.toggleStatus();
        }
      }, 1000);
      for (const fn of this.connectListeners) fn();
    } catch (e) {
      streamDeck.logger.error(`[atsService] connect failed: ${e}`);
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.connected = false;
    streamDeck.logger.info('[atsService] reconnect in 5s...');
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.serial.disconnect();
      this.serial = new AtsSerial();
      this.serial.on('status', (s: AtsStatus) => {
        for (const fn of this.listeners) fn(s);
      });
      this.serial.on('error', (e: unknown) => {
        streamDeck.logger.error(`[atsService] serial error: ${e}`);
        this.scheduleReconnect();
      });
      await this.connect();
    }, 5000);
  }

  subscribe(fn: StatusListener): void { this.listeners.add(fn); }
  unsubscribe(fn: StatusListener): void { this.listeners.delete(fn); }
  onConnect(fn: ConnectListener): void { this.connectListeners.add(fn); }
  offConnect(fn: ConnectListener): void { this.connectListeners.delete(fn); }

  tune(hz: number, mode?: string): void {
    streamDeck.logger.info(`[atsService] tune ${hz} ${mode ?? ''} connected=${this.connected}`);
    this.serial.tune(hz, mode);
  }

  send(cmd: string): void { this.serial.send(cmd); }
  volumeUp(steps = 1): void { for (let i = 0; i < steps; i++) this.serial.send('V'); }
  volumeDown(steps = 1): void { for (let i = 0; i < steps; i++) this.serial.send('v'); }
  isConnected(): boolean { return this.connected; }

  async capture(): Promise<string> {
    return new Promise((resolve, reject) => {
      const hexLines: string[] = [];
      let started = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const onRaw = (line: string) => {
        if (!started) {
          if (line.startsWith('424d')) started = true;
          else return;
        }
        hexLines.push(line);
        if (timer) clearTimeout(timer);
        timer = setTimeout(async () => {
          this.serial.removeListener('raw', onRaw);
          try {
            const buf = Buffer.from(hexLines.join(''), 'hex');
            const ts = new Date().toISOString().replace(/[T:]/g, '-').replace(/\..+/, '');
            const path = join(homedir(), `ats-mini-${ts}.bmp`);
            await writeFile(path, buf);
            streamDeck.logger.info(`[atsService] capture saved: ${path} (${buf.length} bytes)`);
            // C command sets remoteLogOn=false; re-enable status output
            if (this.statusCheckTimer) { clearTimeout(this.statusCheckTimer); this.statusCheckTimer = null; }
            this.statusReceived = false;
            this.serial.toggleStatus();
            this.statusCheckTimer = setTimeout(() => {
              this.statusCheckTimer = null;
              if (!this.statusReceived) this.serial.toggleStatus();
            }, 1000);
            resolve(path);
          } catch (e) {
            reject(e);
          }
        }, 2000);
      };

      this.serial.on('raw', onRaw);
      this.serial.send('C');
      streamDeck.logger.info('[atsService] capture started');
    });
  }
}

export const atsService = new AtsService();
