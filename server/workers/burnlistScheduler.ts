/**
 * Burnlist Wednesday scheduler.
 *
 * Independent of Redis. Wakes every 60 seconds; the moment local time crosses
 * into a new Wednesday (≈ 00:00–00:01 KL), it creates the BurnlistWeek
 * snapshot for that day pulling fresh data from ebrightleads_db.studentrecords.
 *
 * Also runs a catch-up check on startup so a missed Wednesday (worker was
 * down all day) gets snapshotted as soon as the process boots.
 */

import { currentWeekWednesday } from "@/lib/burnlist-week";
import { ensureWeekSnapshot } from "@/lib/burnlist-snapshot";

const TICK_INTERVAL_MS = 60 * 1000; // 1 minute

let interval: NodeJS.Timeout | null = null;
let lastObservedWeek = "";

async function tick(): Promise<void> {
  try {
    const wk = currentWeekWednesday();
    if (wk === lastObservedWeek) return; // calendar Wednesday hasn't changed
    lastObservedWeek = wk;
    const { week, created } = await ensureWeekSnapshot(wk);
    if (created) {
      console.log(
        `[burnlistScheduler] Created snapshot for ${wk} (${week.entries.length} entries)`,
      );
    }
  } catch (err) {
    // Snapshot can fail if the upstream studentrecords DB is briefly down or
    // a concurrent process created the week first. Reset the cache so we
    // retry next tick.
    lastObservedWeek = "";
    console.warn(
      "[burnlistScheduler] tick failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

export async function startBurnlistScheduler(): Promise<void> {
  // Catch-up check on startup — covers the "worker was down on Wednesday" case.
  await tick();
  interval = setInterval(() => {
    void tick();
  }, TICK_INTERVAL_MS);
  console.log(
    "[burnlistScheduler] Started — checks every 60s for Wednesday rollover",
  );
}

export async function stopBurnlistScheduler(): Promise<void> {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
