import { boolean, foreignKey, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Every table except platform configuration carries `organisationId`
 * (ADR 0001, ADR 0005). Rows that point at rows of another table do so with
 * composite foreign keys that include the Organisation, so the database
 * itself refuses an association across Organisations. Column names are
 * snake_case through Drizzle's `casing` option, so keys here are camelCase.
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
    retired: boolean().notNull().default(false),
    createdAt: timestamptz().notNull(),
  },
  (table) => [
    uniqueIndex("departments_organisation_name_key_unique").on(table.organisationId, table.nameKey),
    unique("departments_organisation_id_id_unique").on(table.organisationId, table.id),
  ],
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
    retired: boolean().notNull().default(false),
    createdAt: timestamptz().notNull(),
  },
  (table) => [
    uniqueIndex("sites_organisation_name_key_unique").on(table.organisationId, table.nameKey),
    unique("sites_organisation_id_id_unique").on(table.organisationId, table.id),
  ],
);

/** Provisioned until first login, Active after it, Suspended or Departed by an admin or the roster. */
export const memberStatus = pgEnum("member_status", ["provisioned", "active", "suspended", "departed"]);

export const activities = pgTable("activities", {
  id: uuid().primaryKey().defaultRandom(),
  organisationId: uuid().notNull().references(() => organisations.id),
  name: text().notNull(),
  nameKey: text().notNull(),
  retired: boolean().notNull().default(false),
  createdAt: timestamptz().notNull(),
}, (table) => [
  uniqueIndex("activities_organisation_name_key_unique").on(table.organisationId, table.nameKey),
  unique("activities_organisation_id_id_unique").on(table.organisationId, table.id),
]);

export const siteShares = pgTable("site_shares", {
  organisationId: uuid().notNull().references(() => organisations.id),
  siteId: uuid().notNull(),
  sharedWithOrganisationId: uuid().notNull().references(() => organisations.id),
}, (table) => [
  primaryKey({ columns: [table.organisationId, table.siteId, table.sharedWithOrganisationId] }),
  foreignKey({
    name: "site_shares_site_same_organisation_fk",
    columns: [table.organisationId, table.siteId],
    foreignColumns: [sites.organisationId, sites.id],
  }),
]);

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
    departmentId: uuid(),
    siteId: uuid(),
    departmentCorrectedByMember: boolean().notNull().default(false),
    siteCorrectedByMember: boolean().notNull().default(false),
    /** The Organisation's own identifier for the person, from the roster or the login. */
    staffIdentifier: text(),
    isPlatformAdmin: boolean().notNull().default(false),
    isOrganisationAdmin: boolean().notNull().default(false),
    /** When the Member acknowledged the first-login notice about what admins can see (ADR 0006). */
    adminVisibilityNoticeAcknowledgedAt: timestamptz(),
    createdAt: timestamptz().notNull(),
    updatedAt: timestamptz().notNull(),
  },
  (table) => [
    uniqueIndex("members_organisation_email_unique").on(table.organisationId, table.email),
    unique("members_organisation_id_id_unique").on(table.organisationId, table.id),
    foreignKey({
      name: "members_department_same_organisation_fk",
      columns: [table.organisationId, table.departmentId],
      foreignColumns: [departments.organisationId, departments.id],
    }),
    foreignKey({
      name: "members_site_same_organisation_fk",
      columns: [table.organisationId, table.siteId],
      foreignColumns: [sites.organisationId, sites.id],
    }),
  ],
);

/** Something an Organisation Admin should look at, raised by the application. */
export const organisationAdminNoticeKind = pgEnum("organisation_admin_notice_kind", ["unknown_login"]);

export const adminAuditEntries = pgTable("admin_audit_entries", {
  id: uuid().primaryKey().defaultRandom(),
  organisationId: uuid().notNull().references(() => organisations.id),
  actorMemberId: uuid().notNull(),
  action: text().notNull(),
  filter: jsonb().$type<Record<string, string>>().notNull(),
  createdAt: timestamptz().notNull(),
}, (table) => [foreignKey({
  name: "admin_audit_entries_actor_same_organisation_fk",
  columns: [table.organisationId, table.actorMemberId],
  foreignColumns: [members.organisationId, members.id],
})]);

export const organisationAdminNotices = pgTable(
  "organisation_admin_notices",
  {
    id: uuid().primaryKey().defaultRandom(),
    organisationId: uuid()
      .notNull()
      .references(() => organisations.id),
    kind: organisationAdminNoticeKind().notNull(),
    /** The Member the notice is about, when there is one. */
    memberId: uuid(),
    createdAt: timestamptz().notNull(),
  },
  (table) => [
    foreignKey({
      name: "organisation_admin_notices_member_same_organisation_fk",
      columns: [table.organisationId, table.memberId],
      foreignColumns: [members.organisationId, members.id],
    }),
  ],
);
