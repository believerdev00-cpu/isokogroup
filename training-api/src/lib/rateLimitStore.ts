import type { IncrementResponse, Options, Store } from "express-rate-limit";
import { query, queryOne } from "../db.js";

/**
 * Rate-limit counters kept in the database (public.rate_limit_counters, shared
 * with the rest of Isoko) instead of in memory: as an Edge Function the API
 * runs in many short-lived instances, and in-memory counts started from zero in
 * each of them.
 */
export class DatabaseStore implements Store {
  localKeys = false;
  prefix: string;
  private windowMs = 60 * 60 * 1000;

  constructor(name: string) {
    this.prefix = `training:${name}:`;
  }

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  private windowStart() {
    return new Date(Math.floor(Date.now() / this.windowMs) * this.windowMs);
  }

  async increment(key: string): Promise<IncrementResponse> {
    const start = this.windowStart();
    const row = await queryOne<{ hits: number }>(
      `INSERT INTO public.rate_limit_counters (bucket, key, window_start, hits) VALUES ($1, $2, $3, 1)
       ON CONFLICT (bucket, key, window_start) DO UPDATE SET hits = rate_limit_counters.hits + 1
       RETURNING hits`,
      [this.prefix, key, start],
    );
    return { totalHits: row!.hits, resetTime: new Date(start.getTime() + this.windowMs) };
  }

  async decrement(key: string) {
    await query(
      "UPDATE public.rate_limit_counters SET hits = greatest(hits - 1, 0) WHERE bucket = $1 AND key = $2 AND window_start = $3",
      [this.prefix, key, this.windowStart()],
    );
  }

  async resetKey(key: string) {
    await query("DELETE FROM public.rate_limit_counters WHERE bucket = $1 AND key = $2", [this.prefix, key]);
  }
}
