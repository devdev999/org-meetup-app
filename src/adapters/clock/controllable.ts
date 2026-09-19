import type { Clock } from "../../application/ports";

interface ScheduledAction { at: number; interval: number; run: () => Promise<void>; pending?: Promise<void> }

/** Test clock: stands still until a test moves it. */
export class ControllableClock implements Clock {
  #current: Date;
  #scheduled = new Set<ScheduledAction>();

  constructor(start: Date) {
    this.#current = new Date(start);
  }

  now(): Date {
    return new Date(this.#current);
  }

  set(to: Date): void {
    this.#current = new Date(to);
  }

  async advance(milliseconds: number): Promise<void> {
    const target = this.#current.getTime() + milliseconds;
    while (true) {
      const next = [...this.#scheduled].filter((task) => task.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this.#current = new Date(Math.max(this.#current.getTime(), next.at));
      next.at = this.#current.getTime() + next.interval;
      next.pending = next.run();
      try { await next.pending; } finally { next.pending = undefined; }
    }
    this.#current = new Date(target);
  }

  every(milliseconds: number, action: () => Promise<void>): () => Promise<void> {
    const task: ScheduledAction = { at: this.#current.getTime() + milliseconds, interval: milliseconds, run: action };
    this.#scheduled.add(task);
    return async () => {
      this.#scheduled.delete(task);
      await task.pending;
    };
  }
}
