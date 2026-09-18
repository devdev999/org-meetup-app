export type InvalidInputCode = "unknown-department" | "unknown-site";

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
