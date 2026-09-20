/**
 * Ports: the seams where the application meets the outside world.
 *
 * Each port has two adapters, one for production and one in-memory for tests
 * and local development (see `src/adapters`). Postgres is not a port: the
 * application owns its tables and tests run against a real database.
 */

/** How one Organisation's Members sign in: its OpenID Connect issuer. */
export interface OidcSettings {
  /** Issuer identifier, e.g. `https://idp.ministry-a.example`. */
  issuer: string;
  clientId: string;
  /** Null for a public client that relies on PKCE alone. */
  clientSecret: string | null;
}

/** Everything the identity provider needs to start one sign-in. */
export interface AuthorizationRequest {
  redirectUri: string;
  state: string;
  nonce: string;
  /** PKCE verifier; the adapter derives the challenge that goes in the URL. */
  codeVerifier: string;
}

/** The issuer's answer, plus what the application remembered when it started. */
export interface SignInCallback {
  /** The full URL the browser was sent back to, including query parameters. */
  callbackUrl: string;
  redirectUri: string;
  expectedState: string;
  expectedNonce: string;
  codeVerifier: string;
}

/** Claims exactly as the issuer stated them; the application maps them. */
export type RawClaims = Record<string, unknown>;

/** Identity claims from OpenID Connect. */
export interface IdentityPort {
  /** Where to send the browser so the issuer can authenticate the person. */
  authorizationUrl(settings: OidcSettings, request: AuthorizationRequest): Promise<string>;
  /** Turns the issuer's callback into verified claims, or throws `IdentityError`. */
  claimsFromCallback(settings: OidcSettings, callback: SignInCallback): Promise<RawClaims>;
}

/** Thrown by an identity adapter when a callback cannot be trusted. */
export class IdentityError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "IdentityError";
  }
}

/** The clock, so that time-dependent behaviour is testable. */
export interface Clock {
  now(): Date;
  every(milliseconds: number, action: () => Promise<void>): () => Promise<void>;
}

export type InterestKind = "skill" | "hobby";

export interface AiInterestRequest {
  phrase: string;
  shortlist: Array<{ name: string; kind: InterestKind; count: number }>;
}

export type AiInterestResolution = { existingName: string } | { name: string; kind: InterestKind };

export interface AiExtractionRequest { activity: string; description: string }
export interface AiExtractedInterest { phrase: string; kind: InterestKind }

export interface AiPort {
  resolveInterest(input: AiInterestRequest, signal?: AbortSignal): Promise<AiInterestResolution>;
  extractInterests(input: AiExtractionRequest, signal?: AbortSignal): Promise<AiExtractedInterest[]>;
}

export type TelegramAvailabilityAction = { kind: "availability-activity"; activityId: string }
  | { kind: "availability-post"; activityId: string; issuedAt: Date; minutes: number; placeKind: "physical" | "virtual" };

export interface TelegramMessage {
  chatId: string;
  text: string;
  joinMeetupId?: string;
  joinEventId?: string;
  inviteId?: string;
  rsvpMeetupId?: string;
  rsvpEventId?: string;
  buttons?: Array<Array<{ text: string; action: TelegramAvailabilityAction }>>;
}

export interface TelegramPort {
  readonly botUsername: string | null;
  sendMessage(message: TelegramMessage): Promise<void>;
  answerCallback(input: { callbackId: string; text: string }): Promise<void>;
}

export interface EmailMessage {
  id: string;
  to: string;
  subject: string;
  text: string;
}

export interface EmailPort {
  sendMessage(message: EmailMessage): Promise<void>;
}
