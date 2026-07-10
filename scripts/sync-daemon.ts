/**
 * scripts/sync-daemon.ts
 *
 * Run this script on the OFFICE machine (the one on the same LAN as the
 * Hikvision scanner at 192.168.100.x).  It polls every 5 seconds, writes
 * new scans to the database, and fires clock-in / clock-out emails — all
 * without any manual intervention.
 *
 * Usage:
 *   npx tsx scripts/sync-daemon.ts
 *
 * To keep it running permanently on Windows, run it via PM2:
 *   npm install -g pm2
 *   pm2 start "npx tsx scripts/sync-daemon.ts" --name ebright-sync
 *   pm2 save
 *   pm2 startup   ← follow the printed command to auto-start on Windows reboot
 */

import 'dotenv/config';
import { syncScannerToDb, syncDateToDb, yesterdayKL } from '@/lib/scanner-sync';

const INTERVAL_MS = 5_000;   // 5 seconds — matches the dashboard refresh

let isRunning  = false;       // prevent overlapping cycles
let cycleCount = 0;

function timestamp() {
  return new Date().toLocaleTimeString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur', hour12: false,
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

async function tick() {
  if (isRunning) return;       // skip if previous cycle hasn't finished
  isRunning = true;
  cycleCount++;

  try {
    await syncScannerToDb();
    if (cycleCount % 60 === 0) {          // log a heartbeat every ~5 min
      process.stdout.write(`\r[${timestamp()}] ✓ Sync running — cycle ${cycleCount}   `);
    }
  } catch (err) {
    console.error(`\n[${timestamp()}] ✗ Sync error:`, (err as Error).message);
  } finally {
    isRunning = false;
  }
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' Ebright Scanner Sync Daemon');
  console.log(` Polling every ${INTERVAL_MS / 1000}s  |  Press Ctrl+C to stop`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // On start: backfill yesterday so any missed data is recovered
  const yesterday = yesterdayKL();
  console.log(`[${timestamp()}] Backfilling yesterday (${yesterday})…`);
  try {
    await syncDateToDb(yesterday, false);
    console.log(`[${timestamp()}] Yesterday backfill done.`);
  } catch (err) {
    console.error(`[${timestamp()}] Yesterday backfill error:`, (err as Error).message);
  }

  // First immediate sync then repeat
  console.log(`[${timestamp()}] Starting live sync…`);
  await tick();
  setInterval(tick, INTERVAL_MS);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
