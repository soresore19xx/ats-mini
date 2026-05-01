import fs from 'fs';
import streamDeck from '@elgato/streamdeck';
import { AtsTune } from './actions/atsTune.js';
import { AtsVolUp } from './actions/atsVolUp.js';
import { AtsVolDown } from './actions/atsVolDown.js';
import { AtsVolMute } from './actions/atsVolMute.js';
import { AtsDialTune } from './actions/atsDialTune.js';
import { AtsDialBand } from './actions/atsDialBand.js';
import { AtsDisplayToggle } from './actions/atsDisplayToggle.js';
import { AtsStatusPanel } from './actions/atsStatusPanel.js';

// single-instance guard
const PID_FILE = '/tmp/ats-mini.pid';
(function claimSingleInstance() {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (pid && pid !== process.pid) {
      try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
    }
  } catch { /* no pid file yet */ }
  fs.writeFileSync(PID_FILE, String(process.pid));
  process.on('exit', () => { try { fs.unlinkSync(PID_FILE); } catch {} });
})();

// absorb EPIPE from Stream Deck closing stdout/stderr
process.stdout.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err; });
process.stderr.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err; });
const safeLog = (msg: string) => { try { process.stderr.write(msg + '\n'); } catch {} };
process.on('uncaughtException', (err) => { safeLog(`[ats-mini] uncaughtException: ${err}`); });
process.on('unhandledRejection', (r) => { safeLog(`[ats-mini] unhandledRejection: ${r}`); });

streamDeck.actions.registerAction(new AtsTune());
streamDeck.actions.registerAction(new AtsVolUp());
streamDeck.actions.registerAction(new AtsVolDown());
streamDeck.actions.registerAction(new AtsVolMute());
streamDeck.actions.registerAction(new AtsDialTune());
streamDeck.actions.registerAction(new AtsDialBand());
streamDeck.actions.registerAction(new AtsDisplayToggle());
streamDeck.actions.registerAction(new AtsStatusPanel());

streamDeck.connect();
