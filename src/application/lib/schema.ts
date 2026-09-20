import { sql } from "drizzle-orm";
import { boolean, check, date, foreignKey, index, integer, jsonb, pgEnum, pgTable, primaryKey, serial, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { NoticeKind } from "./notice-kinds";
import type { RecurrenceRule } from "./recurrence-rule";

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
    statusBeforeSuspension: text().$type<"provisioned" | "active">(),
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
    hasDeclaredInterest: boolean().notNull().default(false),
    firstInterestDeclaredAt: timestamptz(),
    lastActivityAt: timestamptz(),
    createdAt: timestamptz().notNull(),
    updatedAt: timestamptz().notNull(),
  },
  (table) => [
    uniqueIndex("members_organisation_email_unique").on(table.organisationId, table.email),
    unique("members_organisation_id_id_unique").on(table.organisationId, table.id),
    check("members_before_suspension_check", sql`${table.statusBeforeSuspension} is null or ${table.statusBeforeSuspension} in ('provisioned', 'active')`),
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

export const flags = pgTable("flags", {
  id: uuid().primaryKey().defaultRandom(),
  organisationId: uuid().notNull().references(() => organisations.id),
  reporterMemberId: uuid().notNull(),
  targetKind: text().$type<"member" | "meetup" | "event">().notNull(),
  targetMemberId: uuid(),
  gatheringId: uuid(),
  reason: text().notNull(),
  state: text().$type<"open" | "resolved">().notNull().default("open"),
  createdAt: timestamptz().notNull(),
  resolutionNote: text(),
  resolvedAt: timestamptz(),
  resolvedByMemberId: uuid(),
}, (table) => [
  index("flags_queue_idx").on(table.organisationId, table.state, table.createdAt),
  check("flags_target_check", sql`(${table.targetKind} = 'member' and ${table.targetMemberId} is not null and ${table.gatheringId} is null) or (${table.targetKind} in ('meetup', 'event') and ${table.targetMemberId} is null and ${table.gatheringId} is not null)`),
  foreignKey({ columns: [table.organisationId, table.reporterMemberId], foreignColumns: [members.organisationId, members.id] }),
  foreignKey({ columns: [table.organisationId, table.targetMemberId], foreignColumns: [members.organisationId, members.id] }),
  foreignKey({ columns: [table.organisationId, table.gatheringId], foreignColumns: [gatherings.organisationId, gatherings.id] }),
  foreignKey({ columns: [table.organisationId, table.resolvedByMemberId], foreignColumns: [members.organisationId, members.id] }),
]);

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

export const interestKind = pgEnum("interest_kind", ["skill", "hobby"]);
export const stance = pgEnum("stance", ["shares", "seeks"]);

export const interests = pgTable("interests", {
  id: uuid().primaryKey().defaultRandom(),
  organisationId: uuid().notNull().references(() => organisations.id),
  name: text().notNull(),
  nameKey: text().notNull(),
  kind: interestKind().notNull(),
  createdAt: timestamptz().notNull(),
}, (table) => [
  unique("interests_organisation_id_id_unique").on(table.organisationId, table.id),
  uniqueIndex("interests_organisation_name_key_unique").on(table.organisationId, table.nameKey),
]);

export const interestAliases = pgTable("interest_aliases", {
  organisationId: uuid().notNull().references(() => organisations.id),
  interestId: uuid().notNull(),
  phrase: text().notNull(),
  phraseKey: text().notNull(),
  createdAt: timestamptz().notNull(),
}, (table) => [
  primaryKey({ columns: [table.organisationId, table.phraseKey] }),
  foreignKey({
    name: "interest_aliases_interest_same_organisation_fk",
    columns: [table.organisationId, table.interestId],
    foreignColumns: [interests.organisationId, interests.id],
  }),
]);

export const memberInterests = pgTable("member_interests", {
  organisationId: uuid().notNull().references(() => organisations.id),
  memberId: uuid().notNull(),
  interestId: uuid().notNull(),
  stance: stance().notNull(),
}, (table) => [
  primaryKey({ columns: [table.organisationId, table.memberId, table.interestId] }),
  foreignKey({
    name: "member_interests_member_same_organisation_fk",
    columns: [table.organisationId, table.memberId],
    foreignColumns: [members.organisationId, members.id],
  }),
  foreignKey({
    name: "member_interests_interest_same_organisation_fk",
    columns: [table.organisationId, table.interestId],
    foreignColumns: [interests.organisationId, interests.id],
  }),
]);

export const availabilities = pgTable("availabilities", {
  id: uuid().primaryKey().defaultRandom(),
  organisationId: uuid().notNull().references(() => organisations.id),
  memberId: uuid().notNull(),
  activityId: uuid().notNull(),
  siteId: uuid(),
  startsAt: timestamptz().notNull(),
  endsAt: timestamptz().notNull(),
  expiredAt: timestamptz(),
  createdAt: timestamptz().notNull(),
}, (table) => [
  index("availabilities_open_idx").on(table.organisationId, table.endsAt).where(sql`${table.expiredAt} is null`),
  foreignKey({ columns: [table.organisationId, table.memberId], foreignColumns: [members.organisationId, members.id] }),
  foreignKey({ columns: [table.organisationId, table.activityId], foreignColumns: [activities.organisationId, activities.id] }),
  foreignKey({ columns: [table.organisationId, table.siteId], foreignColumns: [sites.organisationId, sites.id] }),
]);

export const availabilityNoticePairs = pgTable("availability_notice_pairs", {
  organisationId: uuid().notNull().references(() => organisations.id),
  firstMemberId: uuid().notNull(),
  secondMemberId: uuid().notNull(),
  day: text().notNull(),
}, (table) => [
  primaryKey({ columns: [table.organisationId, table.firstMemberId, table.secondMemberId, table.day] }),
  foreignKey({ columns: [table.organisationId, table.firstMemberId], foreignColumns: [members.organisationId, members.id] }),
  foreignKey({ columns: [table.organisationId, table.secondMemberId], foreignColumns: [members.organisationId, members.id] }),
]);

export const gatheringKind = pgEnum("gathering_kind", ["meetup", "event"]);
export const gatheringStatus = pgEnum("gathering_status", ["scheduled", "cancelled", "completed", "proposed", "rejected"]);

const gatheringFields = () => ({
  id: uuid().primaryKey().defaultRandom(),
  organisationId: uuid().notNull().references(() => organisations.id),
  kind: gatheringKind().notNull(),
  hostMemberId: uuid().notNull(),
  activityId: uuid().notNull(),
  startsAt: timestamptz().notNull(),
  durationMinutes: integer().notNull(),
  placeKind: text().$type<"physical" | "virtual">().notNull(),
  placeSiteId: uuid(),
  placeSpot: text(),
  placeUrl: text(),
  capacity: integer(),
  audienceKind: text().$type<"open" | "invite-only">().notNull(),
  audienceScope: text().$type<"site" | "organisation">(),
  audienceSiteId: uuid(),
  description: text().notNull().default(""),
  createdAt: timestamptz().notNull(),
});

export const recurrences = pgTable("recurrences", {
  ...gatheringFields(),
  frequency: text().$type<RecurrenceRule["frequency"]>().notNull(),
  endsOn: date(),
  stoppedAt: timestamptz(),
}, (table) => [
  unique("recurrences_organisation_id_id_unique").on(table.organisationId, table.id),
  index("recurrences_active_idx").on(table.organisationId, table.startsAt).where(sql`${table.stoppedAt} is null`),
  foreignKey({ columns: [table.organisationId, table.hostMemberId], foreignColumns: [members.organisationId, members.id] }),
  foreignKey({ columns: [table.organisationId, table.activityId], foreignColumns: [activities.organisationId, activities.id] }),
  foreignKey({ columns: [table.organisationId, table.placeSiteId], foreignColumns: [sites.organisationId, sites.id] }),
  foreignKey({ columns: [table.organisationId, table.audienceSiteId], foreignColumns: [sites.organisationId, sites.id] }),
]);

export const recurrenceMembers = pgTable("recurrence_members", {
  organisationId: uuid().notNull().references(() => organisations.id),
  recurrenceId: uuid().notNull(),
  memberId: uuid().notNull(),
  position: serial().notNull(),
}, (table) => [
  primaryKey({ columns: [table.organisationId, table.recurrenceId, table.memberId] }),
  foreignKey({ columns: [table.organisationId, table.recurrenceId], foreignColumns: [recurrences.organisationId, recurrences.id] }),
  foreignKey({ columns: [table.organisationId, table.memberId], foreignColumns: [members.organisationId, members.id] }),
]);

export const recurrenceInterests = pgTable("recurrence_interests", {
  organisationId: uuid().notNull().references(() => organisations.id),
  recurrenceId: uuid().notNull(),
  interestId: uuid().notNull(),
}, (table) => [
  primaryKey({ columns: [table.organisationId, table.recurrenceId, table.interestId] }),
  foreignKey({ columns: [table.organisationId, table.recurrenceId], foreignColumns: [recurrences.organisationId, recurrences.id] }),
  foreignKey({ columns: [table.organisationId, table.interestId], foreignColumns: [interests.organisationId, interests.id] }),
]);

export const gatherings = pgTable("gatherings", {
  ...gatheringFields(),
  status: gatheringStatus().notNull(),
  hadWaitlist: boolean().default(false),
  recurrenceId: uuid(),
  scheduledStartsAt: timestamptz(),
}, (table) => [
  unique("gatherings_organisation_id_id_unique").on(table.organisationId, table.id),
  unique("gatherings_recurrence_occurrence_unique").on(table.organisationId, table.recurrenceId, table.scheduledStartsAt),
  foreignKey({ columns: [table.organisationId, table.recurrenceId], foreignColumns: [recurrences.organisationId, recurrences.id] }),
  foreignKey({ columns: [table.organisationId, table.hostMemberId], foreignColumns: [members.organisationId, members.id] }),
  foreignKey({ columns: [table.organisationId, table.activityId], foreignColumns: [activities.organisationId, activities.id] }),
  foreignKey({ columns: [table.organisationId, table.placeSiteId], foreignColumns: [sites.organisationId, sites.id] }),
  foreignKey({ columns: [table.organisationId, table.audienceSiteId], foreignColumns: [sites.organisationId, sites.id] }),
]);

export const eventProposals = pgTable("event_proposals", {
  organisationId: uuid().notNull().references(() => organisations.id),
  eventId: uuid().notNull(),
  proposerMemberId: uuid().notNull(),
  state: text().$type<"proposed" | "approved" | "rejected">().notNull().default("proposed"),
  note: text(),
  recurrence: jsonb().$type<Pick<RecurrenceRule, "frequency" | "endsOn">>(),
  invitedMemberIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
}, (table) => [
  primaryKey({ columns: [table.organisationId, table.eventId] }),
  foreignKey({ columns: [table.organisationId, table.eventId], foreignColumns: [gatherings.organisationId, gatherings.id] }),
  foreignKey({ columns: [table.organisationId, table.proposerMemberId], foreignColumns: [members.organisationId, members.id] }),
]);

export const eventOrganisations = pgTable("event_organisations", {
  organisationId: uuid().notNull().references(() => organisations.id),
  eventId: uuid().notNull(),
  openedToOrganisationId: uuid().notNull().references(() => organisations.id),
}, (table) => [
  primaryKey({ columns: [table.organisationId, table.eventId, table.openedToOrganisationId] }),
  foreignKey({ columns: [table.organisationId, table.eventId], foreignColumns: [gatherings.organisationId, gatherings.id] }),
]);

export const gatheringInterests = pgTable("gathering_interests", {
  organisationId: uuid().notNull().references(() => organisations.id),
  gatheringId: uuid().notNull(),
  interestId: uuid().notNull(),
}, (table) => [
  primaryKey({ columns: [table.organisationId, table.gatheringId, table.interestId] }),
  foreignKey({ columns: [table.organisationId, table.gatheringId], foreignColumns: [gatherings.organisationId, gatherings.id] }),
  foreignKey({ columns: [table.organisationId, table.interestId], foreignColumns: [interests.organisationId, interests.id] }),
]);

export const gatheringMembers = pgTable("gathering_members", {
  organisationId: uuid().notNull().references(() => organisations.id),
  gatheringId: uuid().notNull(),
  memberId: uuid().notNull(),
  status: text().$type<"participant" | "waitlisted">().notNull(),
  position: serial().notNull(),
}, (table) => [
  primaryKey({ columns: [table.organisationId, table.gatheringId, table.memberId] }),
  foreignKey({ columns: [table.organisationId, table.gatheringId], foreignColumns: [gatherings.organisationId, gatherings.id] }),
  foreignKey({ columns: [table.organisationId, table.memberId], foreignColumns: [members.organisationId, members.id] }),
]);

export const gatheringRsvps = pgTable("gathering_rsvps", {
  organisationId: uuid().notNull().references(() => organisations.id),
  gatheringId: uuid().notNull(),
  memberId: uuid().notNull(),
  answer: text().$type<"going" | "not-going">(),
  promptedAt: timestamptz(),
}, (table) => [
  primaryKey({ columns: [table.organisationId, table.gatheringId, table.memberId] }),
  foreignKey({ columns: [table.organisationId, table.gatheringId], foreignColumns: [gatherings.organisationId, gatherings.id] }),
  foreignKey({ columns: [table.organisationId, table.memberId], foreignColumns: [members.organisationId, members.id] }),
]);

export const occurrenceRatings = pgTable("occurrence_ratings", {
  organisationId: uuid().notNull().references(() => organisations.id),
  gatheringId: uuid().notNull(),
  memberId: uuid().notNull(),
  value: integer().notNull(),
  createdAt: timestamptz().notNull(),
}, (table) => [
  primaryKey({ columns: [table.organisationId, table.gatheringId, table.memberId] }),
  foreignKey({ columns: [table.organisationId, table.gatheringId], foreignColumns: [gatherings.organisationId, gatherings.id] }),
  foreignKey({ columns: [table.organisationId, table.memberId], foreignColumns: [members.organisationId, members.id] }),
]);

export const attendanceRecords = pgTable("attendance_records", {
  organisationId: uuid().notNull().references(() => organisations.id),
  gatheringId: uuid().notNull(),
  confirmedAt: timestamptz(),
  confirmedByMemberId: uuid(),
  promptedHostMemberId: uuid(),
}, (table) => [
  primaryKey({ columns: [table.organisationId, table.gatheringId] }),
  foreignKey({ columns: [table.organisationId, table.gatheringId], foreignColumns: [gatherings.organisationId, gatherings.id] }),
  foreignKey({ columns: [table.organisationId, table.confirmedByMemberId], foreignColumns: [members.organisationId, members.id] }),
  foreignKey({ columns: [table.organisationId, table.promptedHostMemberId], foreignColumns: [members.organisationId, members.id] }),
]);

export const attendanceMembers = pgTable("attendance_members", {
  organisationId: uuid().notNull().references(() => organisations.id),
  gatheringId: uuid().notNull(),
  memberId: uuid().notNull(),
  attended: boolean().notNull().default(true),
}, (table) => [
  primaryKey({ columns: [table.organisationId, table.gatheringId, table.memberId] }),
  index("attendance_members_history_idx").on(table.organisationId, table.memberId, table.gatheringId),
  foreignKey({ columns: [table.organisationId, table.gatheringId], foreignColumns: [attendanceRecords.organisationId, attendanceRecords.gatheringId] }),
  foreignKey({ columns: [table.organisationId, table.memberId], foreignColumns: [members.organisationId, members.id] }),
]);

export const invites = pgTable("invites", {
  id: uuid().primaryKey().defaultRandom(),
  organisationId: uuid().notNull().references(() => organisations.id),
  gatheringId: uuid().notNull(),
  memberId: uuid().notNull(),
  state: text().$type<"pending" | "accepted" | "declined" | "expired">().notNull().default("pending"),
  createdAt: timestamptz().notNull(),
}, (table) => [
  unique("invites_gathering_member_unique").on(table.organisationId, table.gatheringId, table.memberId),
  foreignKey({ columns: [table.organisationId, table.gatheringId], foreignColumns: [gatherings.organisationId, gatherings.id] }),
  foreignKey({ columns: [table.organisationId, table.memberId], foreignColumns: [members.organisationId, members.id] }),
]);

export const notices = pgTable("notices", {
  id: uuid().primaryKey().defaultRandom(),
  organisationId: uuid().notNull().references(() => organisations.id),
  memberId: uuid().notNull(),
  gatheringId: uuid(),
  kind: text().$type<NoticeKind>().notNull(),
  message: text().notNull(),
  externalMessage: text().notNull().default(""),
  messagePrefix: text(),
  createdAt: timestamptz().notNull(),
  position: serial().notNull(),
}, (table) => [
  unique("notices_organisation_id_id_unique").on(table.organisationId, table.id),
  foreignKey({ columns: [table.organisationId, table.memberId], foreignColumns: [members.organisationId, members.id] }),
  foreignKey({ columns: [table.organisationId, table.gatheringId], foreignColumns: [gatherings.organisationId, gatherings.id] }),
]);

export const noticeDeliveries = pgTable("notice_deliveries", {
  organisationId: uuid().notNull().references(() => organisations.id),
  noticeId: uuid().notNull(),
  channel: text().$type<"telegram" | "email">().notNull(),
  mode: text().$type<"immediate" | "digest">().notNull(),
  scheduledFor: timestamptz().notNull(),
  availableAt: timestamptz().notNull(),
  finishedAt: timestamptz(),
  attempts: integer().notNull().default(0),
  deadLetteredAt: timestamptz(),
  claimToken: uuid(),
}, (table) => [
  primaryKey({ columns: [table.organisationId, table.noticeId, table.channel] }),
  index("notice_deliveries_pending_idx").on(table.mode, table.availableAt).where(sql`${table.finishedAt} is null`),
  foreignKey({ columns: [table.organisationId, table.noticeId], foreignColumns: [notices.organisationId, notices.id] }),
]);

export const telegramLinks = pgTable("telegram_links", {
  organisationId: uuid().notNull().references(() => organisations.id),
  memberId: uuid().notNull(),
  chatId: text().notNull().unique(),
}, (table) => [
  primaryKey({ columns: [table.organisationId, table.memberId] }),
  foreignKey({ columns: [table.organisationId, table.memberId], foreignColumns: [members.organisationId, members.id] }),
]);

export const noticePreferences = pgTable("notice_preferences", {
  organisationId: uuid().notNull().references(() => organisations.id),
  memberId: uuid().notNull(),
  kind: text().$type<NoticeKind>().notNull(),
  telegram: boolean().notNull(),
  email: boolean().notNull(),
}, (table) => [
  primaryKey({ columns: [table.organisationId, table.memberId, table.kind] }),
  foreignKey({ columns: [table.organisationId, table.memberId], foreignColumns: [members.organisationId, members.id] }),
]);

export const telegramLinkCodes = pgTable("telegram_link_codes", {
  organisationId: uuid().notNull().references(() => organisations.id),
  memberId: uuid().notNull(),
  codeHash: text().notNull().unique(),
  expiresAt: timestamptz().notNull(),
}, (table) => [
  primaryKey({ columns: [table.organisationId, table.memberId] }),
  foreignKey({ columns: [table.organisationId, table.memberId], foreignColumns: [members.organisationId, members.id] }),
]);
