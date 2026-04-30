import { SerialPort } from 'serialport';
import { EventEmitter } from 'events';
import { readdir } from 'fs/promises';

export interface AtsStatus {
  version: number;
  freq: number;       // Hz (status packet: kHz×1000 for AM, 10kHz×10000 for FM)
  bfo: number;
  cal: number;
  band: string;
  mode: string;
  step: string;
  bandwidth: string;
  agc: number;
  volume: number;
  rssi: number;
  snr: number;
  tuningCap: number;
  voltage: number;
  seqnum: number;
  avc: number;        // AVC max gain (12-90 dB, 0 = FM mode n/a)
  stereo: boolean;    // FM stereo pilot detected
}

export interface Memory {
  band: string;
  freq: number;  // Hz
  mode: string;
}

export function formatFreq(freq: number, mode: string): string {
  if (mode === 'FM') return `${(freq / 1000000).toFixed(1)} MHz`;
  if (freq >= 1000000) return `${(freq / 1000).toFixed(0)} kHz`;
  return `${freq / 1000} kHz`;
}

export class AtsSerial extends EventEmitter {
  private port: SerialPort | null = null;
  private buf = '';
  private intentionalClose = false;

  async detectPort(): Promise<string> {
    const devs = await readdir('/dev');
    const found = devs
      .filter(d => d.startsWith('cu.usbmodem'))
      .sort()
      .pop();
    if (!found) throw new Error('ATS-Mini not found (/dev/cu.usbmodem*)');
    return `/dev/${found}`;
  }

  async connect(portPath?: string): Promise<void> {
    const path = portPath ?? await this.detectPort();
    return new Promise((resolve, reject) => {
      this.port = new SerialPort({ path, baudRate: 115200 }, (err) => {
        if (err) return reject(err);
        this.port!.on('data', (chunk: Buffer) => this.onData(chunk));
        this.port!.on('close', () => { if (!this.intentionalClose) this.emit('error', new Error('port closed')); });
        this.port!.on('error', (e: Error) => this.emit('error', e));
        resolve();
      });
    });
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.port?.close();
    this.port = null;
  }

  // Direct frequency tune (Hz); omit mode to let firmware auto-detect band
  tune(hz: number, mode?: string): void {
    const cmd = mode ? `F${hz},${mode}\r` : `F${hz}\r`;
    this.port?.write(cmd);
  }

  // Send a single-character command
  send(cmd: string): void {
    this.port?.write(cmd);
  }

  // Toggle periodic status output
  toggleStatus(): void {
    this.port?.write('t');
  }

  private onData(chunk: Buffer): void {
    this.buf += chunk.toString('utf8');
    const lines = this.buf.split('\r\n');
    this.buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const status = this.parseStatus(trimmed);
      if (status) this.emit('status', status);
      else this.emit('raw', trimmed);
    }
  }

  private parseStatus(line: string): AtsStatus | null {
    const parts = line.split(',');
    if (parts.length !== 17) return null;
    const [ver, freq, bfo, cal, band, mode, step, bw, agc, vol, rssi, snr, cap, volt, seq, avc, stereo] = parts;
    if (isNaN(Number(ver)) || isNaN(Number(freq))) return null;
    return {
      version: Number(ver),
      freq: Number(freq),
      bfo: Number(bfo),
      cal: Number(cal),
      band, mode, step,
      bandwidth: bw,
      agc: Number(agc),
      volume: Number(vol),
      rssi: Number(rssi),
      snr: Number(snr),
      tuningCap: Number(cap),
      voltage: Number(volt),
      seqnum: Number(seq),
      avc: Number(avc),
      stereo: stereo === '1',
    };
  }
}
