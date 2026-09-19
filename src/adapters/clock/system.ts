import type { Clock } from "../../application/ports";

/** Production clock: the machine's wall clock. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  every(milliseconds: number, action: () => Promise<void>): () => Promise<void> {
    let pending: Promise<void> | undefined;
    const timer = setInterval(() => {
      if (pending) return;
      pending = action();
      const finished = () => { pending = undefined; };
      void pending.then(finished, finished);
    }, milliseconds);
    timer.unref();
    return async () => {
      clearInterval(timer);
      await pending;
    };
  }
}
