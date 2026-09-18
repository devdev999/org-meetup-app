import { boolean, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Every table except platform configuration carries `organisationId`
 * (ADR 0001, ADR 0005). Column names are snake_case through Drizzle's
 * `casing` option, so keys here are camelCase.
 */

const timestamptz = () => timestamp({ withTimezone: true });

/** An Organisation: one population of Members. */
export const organisations = pgTable("organisations", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  createdAt: timestamptz().notNull(),
});

/** Which claim of the issuer's ID token carries each piece of Member data. */
export interface ClaimMapping {
  email: string;
  name: string;
  department?: string;
  site?: string;
  staffIdentifier?: string;
}

/** How an Organisation's Members sign in. */
export const organisationOidcSettings = pgTable("organisation_oidc_settings", {
  organisationId: uuid()
    .primaryKey()
    .references(() => organisations.id),
  issuer: text().notNull(),
  clientId: text().notNull(),
  clientSecret: text(),
  claimMapping: jsonb().$type<ClaimMapping>().notNull(),
  updatedAt: timestamptz().notNull(),
});

/** A Department: the unit within an Organisation a Member belongs to. Unique by name, ignoring case. */
export const departments = pgTable(
  "departments",
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id),
    name: text().notNull(),
    /** `name` lower-cased and trimmed, so "Finance" and "finance" are one Department. */
    nameKey: text().notNull(),
    createdAt: timestamptz().notNull(),
  },
  (table) => [uniqueIndex("departments_organisation_name_key_unique").on(table.organisationId, table.nameKey)],
);

/** A Site: a physical location where Members are based. Unique by name, ignoring case. */
export const sites = pgTable(
  "sites",
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id),
    name: text().notNull(),
    nameKey: text().notNull(),
    createdAt: timestamptz().notNull(),
  },
  (table) => [uniqueIndex("sites_organisation_name_key_unique").on(table.organisationId, table.nameKey)],
);

/** Provisioned until first login, Active after it, Suspended or Departed by an admin or the roster. */
export const memberStatus = pgEnum("member_status", ["provisioned", "active", "suspended", "departed"]);

export const members = pgTable(
  "members",
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id),
    /** Stored lower-cased; sign-in binds by email within the Organisation. */
    email: text().notNull(),
    name: text().notNull(),
    status: memberStatus().notNull(),
    departmentId: uuid().references(() => departments.id),
    siteId: uuid().references(() => sites.id),
    /** The Organisation's own identifier for the person, from the roster or the login. */
    staffIdentifier: text(),
    isPlatformAdmin: boolean().notNull().default(false),
    /** When the Member acknowledged the first-login notice about what admins can see (ADR 0006). */
    adminVisibilityNoticeAcknowledgedAt: timestamptz(),
    createdAt: timestamptz().notNull(),
    updatedAt: timestamptz().notNull(),
  },
  (table) => [uniqueIndex("members_organisation_email_unique").on(table.organisationId, table.email)],
);

/** Something an Organisation Admin should look at, raised by the application. */
export const adminNoticeKind = pgEnum("admin_notice_kind", ["unknown_login"]);

export const adminNotices = pgTable("admin_notices", {
  id: uuid().primaryKey().defaultRandom(),
  organisationId: uuid()
    .notNull()
    .references(() => organisations.id),
  kind: adminNoticeKind().notNull(),
  /** The Member the notice is about, when there is one. */
  memberId: uuid().references(() => members.id),
  createdAt: timestamptz().notNull(),
});
