import { AtsSerial, AtsStatus } from './AtsSerial.js';
import { writeFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

async function main() {
  const ats = new AtsSerial();
  await ats.connect();
  console.log('Connected.');

  // wait 700ms to see if status output is running
  const statusRunning = await new Promise<boolean>(resolve => {
    const timer = setTimeout(() => resolve(false), 700);
    ats.once('status', () => { clearTimeout(timer); resolve(true); });
  });

  if (statusRunning) {
    console.log('Status output detected, toggling off...');
    ats.send('t');
    // wait 700ms for the last status line to flush
    await new Promise(r => setTimeout(r, 700));
  }

  console.log('Sending capture command...');
  const hexLines: string[] = [];

  const path = await new Promise<string>((resolve, reject) => {
    let started = false;
    let timer: ReturnType<typeof setTimeout>;

    ats.on('raw', (line: string) => {
      if (!started) {
        if (line.startsWith('424d')) started = true;
        else return;
      }
      hexLines.push(line);
      clearTimeout(timer);
      timer = setTimeout(async () => {
        ats.disconnect();
        try {
          const buf = Buffer.from(hexLines.join(''), 'hex');
          const ts = new Date().toISOString().replace(/[T:]/g, '-').replace(/\..+/, '');
          const p = join(homedir(), `ats-mini-${ts}.bmp`);
          await writeFile(p, buf);
          resolve(p);
        } catch (e) { reject(e); }
      }, 2000);
    });

    setTimeout(() => reject(new Error('timeout: no BMP data received')), 15000);
    ats.send('C');
  });

  console.log(`Saved: ${path} (${(await import('fs')).statSync(path).size} bytes)`);
}

main().catch(e => { console.error(e); process.exit(1); });
