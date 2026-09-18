import type { Clock } from "../../application/ports";

/** Production clock: the machine's wall clock. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
