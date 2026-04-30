import { createInterface } from 'readline';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { AtsSerial, AtsStatus, Memory, formatFreq } from './AtsSerial.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const MEMORIES_PATH = join(DIR, '..', 'memories.json');

async function loadMemories(): Promise<Memory[]> {
  const raw = await readFile(MEMORIES_PATH, 'utf8');
  const all: Memory[] = JSON.parse(raw);
  return all.filter(m => m.freq > 0);
}

function printMemories(memories: Memory[]): void {
  console.log('\n--- Memories ---');
  memories.forEach((m, i) => {
    console.log(`[${String(i + 1).padStart(2)}] ${m.band.padEnd(4)} ${formatFreq(m.freq, m.mode).padStart(10)}  ${m.mode}`);
  });
  console.log('--------------');
}

function printHelp(): void {
  console.log('\nCommands:');
  console.log('  <number>      select memory slot');
  console.log('  f<Hz>         tune to frequency (e.g. f107900000)');
  console.log('  f<Hz>,<mode>  tune with mode (e.g. f7100000,LSB)');
  console.log('  V/v           volume +/-');
  console.log('  B/b           band +/-');
  console.log('  M/m           mode +/-');
  console.log('  t             toggle status output');
  console.log('  l/ll          list memory slots');
  console.log('  q             quit');
}

async function main(): Promise<void> {
  const ats = new AtsSerial();

  let lastStatus: AtsStatus | null = null;
  ats.on('status', (s: AtsStatus) => {
    lastStatus = s;
    process.stdout.write(`\r[${s.band}] ${formatFreq(s.freq * (s.mode === 'FM' ? 10000 : 1000), s.mode)} ${s.mode}  RSSI:${s.rssi} SNR:${s.snr} Vol:${s.volume} ${s.voltage.toFixed(2)}V  `);
  });
  ats.on('raw', (line: string) => {
    console.log(`\n< ${line}`);
  });

  console.log('ATS-Mini Controller');
  try {
    await ats.connect();
    console.log('Connected.');
  } catch (e) {
    console.error(`connect failed: ${e}`);
    process.exit(1);
  }

  const memories = await loadMemories();
  printMemories(memories);
  printHelp();

  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: '\n> ' });
  rl.prompt();

  rl.on('line', (line: string) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    if (input === 'q') {
      ats.disconnect();
      rl.close();
      process.exit(0);
    }

    if (input === 'l' || input === 'll') {
      printMemories(memories);
      rl.prompt();
      return;
    }

    if (input === 't') {
      ats.toggleStatus();
      rl.prompt();
      return;
    }

    // single-char commands (V/v/B/b/M/m etc.)
    if (/^[VvBbMmSsWwAaLlOoIi]$/.test(input)) {
      const repeat = (input === 'V' || input === 'v') ? 10 : 1;
      for (let i = 0; i < repeat; i++) ats.send(input);
      rl.prompt();
      return;
    }

    // direct frequency input: f107900000 or f7100000,LSB
    if (input.toLowerCase().startsWith('f')) {
      const rest = input.slice(1);
      const [hzStr, mode] = rest.split(',');
      const hz = parseInt(hzStr, 10);
      if (isNaN(hz)) { console.log('invalid frequency'); rl.prompt(); return; }
      ats.tune(hz, mode);
      console.log(`→ ${formatFreq(hz, mode ?? 'AM')}${mode ? ` (${mode})` : ''}`);
      rl.prompt();
      return;
    }

    // select memory slot by number
    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= 1 && num <= memories.length) {
      const m = memories[num - 1];
      ats.tune(m.freq, m.mode);
      console.log(`→ [${num}] ${m.band} ${formatFreq(m.freq, m.mode)} ${m.mode}`);
    } else {
      console.log('? (q=quit, l=list, ?=help)');
      if (input === '?') printHelp();
    }

    rl.prompt();
  });
}

main();
