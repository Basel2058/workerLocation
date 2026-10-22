import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';

interface Bucket {
  hour: number;
  total: number;
  e4xx: number;
  e5xx: number;
}

/** In-memory request counters (last 24 hours, hourly buckets) and event-loop health. */
export class Metrics {
  private buckets: Bucket[] = [];
  private loop: IntervalHistogram;

  constructor() {
    this.loop = monitorEventLoopDelay({ resolution: 20 });
    this.loop.enable();
  }

  recordResponse(statusCode: number, now = Date.now()): void {
    const hour = Math.floor(now / 3_600_000);
    let bucket = this.buckets[this.buckets.length - 1];
    if (!bucket || bucket.hour !== hour) {
      bucket = { hour, total: 0, e4xx: 0, e5xx: 0 };
      this.buckets.push(bucket);
      this.buckets = this.buckets.filter((b) => b.hour > hour - 24);
    }
    bucket.total++;
    if (statusCode >= 500) bucket.e5xx++;
    else if (statusCode >= 400) bucket.e4xx++;
  }

  last24h(now = Date.now()): { total: number; errors4xx: number; errors5xx: number } {
    const hour = Math.floor(now / 3_600_000);
    const recent = this.buckets.filter((b) => b.hour > hour - 24);
    return {
      total: recent.reduce((s, b) => s + b.total, 0),
      errors4xx: recent.reduce((s, b) => s + b.e4xx, 0),
      errors5xx: recent.reduce((s, b) => s + b.e5xx, 0),
    };
  }

  lastHour5xx(now = Date.now()): { total: number; e5xx: number } {
    const hour = Math.floor(now / 3_600_000);
    const recent = this.buckets.filter((b) => b.hour >= hour - 1);
    return { total: recent.reduce((s, b) => s + b.total, 0), e5xx: recent.reduce((s, b) => s + b.e5xx, 0) };
  }

  eventLoopP99Ms(): number {
    const p99 = this.loop.percentile(99) / 1e6;
    this.loop.reset();
    return Math.round(p99 * 10) / 10;
  }

  stop(): void {
    this.loop.disable();
  }
}
