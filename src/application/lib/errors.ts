export type InvalidInputCode = "unknown-department" | "unknown-site" | "invalid-roster" | "stale-roster" | "invalid-list-entry" | "duplicate-list-entry" | "invalid-interest" | "unknown-interest" | "alias-conflict" | "interest-name-conflict" | "invalid-meetup" | "invalid-event" | "invalid-telegram-link" | "invalid-notice-preference" | "invalid-availability" | "invalid-attendance" | "invalid-rating" | "invalid-flag" | "invalid-moderation" | "invalid-report" | "invalid-organisation" | "invalid-ministry" | "invalid-settings" | "invalid-scout";

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
