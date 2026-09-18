import type { Clock } from "../../application/ports";

/** Test clock: stands still until a test moves it. */
export class ControllableClock implements Clock {
  #current: Date;

  constructor(start: Date) {
    this.#current = new Date(start);
  }

  now(): Date {
    return new Date(this.#current);
  }

  set(to: Date): void {
    this.#current = new Date(to);
  }

  advance(milliseconds: number): void {
    this.#current = new Date(this.#current.getTime() + milliseconds);
  }
}
