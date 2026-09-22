import { refreshIntakeStatuses } from "./services/intakes.js";
import { dispatchEmails } from "./services/notifications.js";

// Background work, throttled per server instance. Dates move intakes between
// upcoming/open/closed even when nobody touches them, and pending emails are sent
// after the work that created them has committed.
const JOBS = [
  { name: "emails", everyMs: 5 * 1000, run: () => dispatchEmails() },
  { name: "intake statuses", everyMs: 10 * 60 * 1000, run: () => refreshIntakeStatuses() },
];

const lastRun = new Map<string, number>();
const running = new Set<string>();

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

/** Runs the jobs that are due, without delaying the caller. */
export function runJobsSoon() {
  const now = Date.now();
  for (const job of JOBS) {
    if (running.has(job.name) || now - (lastRun.get(job.name) ?? 0) < job.everyMs) continue;
    lastRun.set(job.name, now);
    running.add(job.name);
    const work = job
      .run()
      .catch((err) => console.error(`[${job.name}]`, err instanceof Error ? err.message : err))
      .finally(() => running.delete(job.name));
    // Keeps an Edge Function alive until the job is done
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
  }
}
