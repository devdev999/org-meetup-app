export type InvalidInputCode = "unknown-department" | "unknown-site" | "invalid-roster" | "stale-roster" | "invalid-list-entry" | "duplicate-list-entry" | "invalid-meetup";

/** Thrown when input names something the actor's Organisation does not have. */
export class InvalidInputError extends Error {
  constructor(
    readonly code: InvalidInputCode,
    message: string,
  ) {
    super(message);
    this.name = "InvalidInputError";
  }
}

export class AdminVisibilityNoticeRequiredError extends Error {
  constructor() {
    super("acknowledge the notice about Organisation Admin visibility before continuing");
    this.name = "AdminVisibilityNoticeRequiredError";
  }
}

export class AccessDeniedError extends Error {
  constructor() {
    super("this Member cannot access this area");
    this.name = "AccessDeniedError";
  }
}
