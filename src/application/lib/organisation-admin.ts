import { and, eq } from "drizzle-orm";
import { recordMemberActivity, requireActiveMember, type Actor } from "./actor";
import { auditTable, readAdminAudit, recordAdminView, type AdminAuditEntry } from "./admin-audit";
import type { Queryable } from "./departments-and-sites";
import type { Deps } from "./deps";
import { AccessDeniedError } from "./errors";
import { isUuid } from "./input";
import { organisationReport } from "./reports";
import type { Report, ReportPeriod } from "./report-types";
import { memberReport } from "./member-reports";
import { attendanceHistoryTable, ratingsTable } from "./attendance-reports";
import { exportReportTable, tableCsv, type ReportCsv } from "./report-csv";
import { ratings, readAttendanceHistory, type ActivityRating, type AttendanceHistoryEntry } from "./attendance";
import { approveEvent, createEvent, managedEvents, readEventProposals, reassignEventHost, rejectEvent, type EventProposal, type ManagedEvent } from "./events";
import type { CreateEventInput, EventDetail, GatheringKind } from "./meetups";
import { deliverSoon } from "./notifications";
import { cancelManagedOccurrence, changeMemberAccess, readFlags, resolveFlag, upcomingOccurrences, type Flag, type ModerationOccurrence } from "./moderation";
import {
  commitRoster,
  previewRoster,
  readRoster,
  type RosterMember,
  type RosterPreview,
  type RosterRow,
} from "./roster";
import { members, organisationAdminNotices, organisations } from "./schema";
import { clusteringCatalog, readInterestMergeProposals, requestInterestClusters, saveInterestClusters, type InterestMergeProposal } from "./interest-clustering";
import { approveInterestMerge, readInterestMergeHistory, splitInterestMerge, type InterestMerge } from "./interest-merges";
import { listInterests, updateInterest, type Interest } from "./interests";
import {
  organisationLists,
  retireListEntry,
  saveListEntry,
  type OrganisationListEntry,
  type OrganisationListKind,
  type OrganisationLists,
} from "./organisation-lists";

export interface OrganisationAdminActions {
  interests(): Promise<Interest[]>;
  updateInterest(interestId: string, input: Pick<Interest, "name" | "kind">): Promise<void>;
  interestMergeProposals(): Promise<InterestMergeProposal[]>;
  proposeInterestMerges(): Promise<void>;
  approveInterestMerge(id: string, survivingInterestId: string): Promise<void>;
  interestMergeHistory(): Promise<InterestMerge[]>;
  splitInterestMerge(id: string): Promise<void>;
  reports(period: ReportPeriod, tableId?: string): Promise<Report>;
  memberReport(memberId: string, period: ReportPeriod): Promise<Report>;
  exportReport(tableId: string, period: ReportPeriod): Promise<ReportCsv>;
  exportMemberReport(memberId: string, tableId: string, period: ReportPeriod): Promise<ReportCsv>;
  exportAuditLog(): Promise<ReportCsv>;
  exportRatings(): Promise<ReportCsv>;
  exportMemberAttendance(memberId: string): Promise<ReportCsv>;
  upcomingOccurrences(): Promise<ModerationOccurrence[]>;
  flags(state?: Flag["state"]): Promise<Flag[]>;
  resolveFlag(id: string, note: string): Promise<void>;
  cancelMeetup(id: string): Promise<void>;
  cancelEvent(id: string): Promise<void>;
  suspendMember(id: string): Promise<void>;
  reinstateMember(id: string): Promise<void>;
  memberAttendance(memberId: string): Promise<AttendanceHistoryEntry[]>;
  ratings(): Promise<ActivityRating[]>;
  createEvent(input: CreateEventInput): Promise<EventDetail>;
  eventProposals(): Promise<EventProposal[]>;
  events(): Promise<ManagedEvent[]>;
  approveEvent(id: string, note?: string): Promise<void>;
  rejectEvent(id: string, note: string): Promise<void>;
  reassignEventHost(id: string, memberId: string): Promise<void>;
  roster(): Promise<RosterMember[]>;
  previewRoster(rows: RosterRow[]): Promise<RosterPreview>;
  commitRoster(rows: RosterRow[], revision: string): Promise<void>;
  lists(): Promise<OrganisationLists>;
  createListEntry(kind: OrganisationListKind, name: string): Promise<OrganisationListEntry>;
  renameListEntry(kind: OrganisationListKind, id: string, name: string): Promise<OrganisationListEntry>;
  retireListEntry(kind: OrganisationListKind, id: string): Promise<void>;
  unknownLoginNotices(): Promise<UnknownLoginNotice[]>;
  auditLog(): Promise<AdminAuditEntry[]>;
}

export interface UnknownLoginNotice {
  memberId: string;
  name: string;
  email: string;
  createdAt: Date;
}

export type { AdminAuditEntry } from "./admin-audit";

export async function organisationAdmin(deps: Deps, actor: Actor): Promise<OrganisationAdminActions> {
  async function requireAdmin(db: Queryable) {
    const member = await requireActiveMember(db, actor);
    if (!member.isOrganisationAdmin) throw new AccessDeniedError();
  }
  await requireAdmin(deps.db);

  async function authorised<T>(operation: (db: Queryable) => Promise<T>, auditAction?: string, filter: Record<string, string> = {}): Promise<T> {
    return deps.db.transaction(async (tx) => {
      await tx
        .select({ id: organisations.id })
        .from(organisations)
        .where(eq(organisations.id, actor.organisationId))
        .for("update");
      await requireAdmin(tx);
      const result = await operation(tx);
      if (auditAction)
        await recordAdminView(tx, actor, { action: auditAction, filter }, deps.clock.now());
      return result;
    });
  }
  async function cancel(id: string, kind: GatheringKind): Promise<void> {
    await command((db) => cancelManagedOccurrence(db, actor, id, kind, deps.clock.now()));
    await deliverSoon(deps, { organisationId: actor.organisationId, gatheringId: id });
  }
  function command<T>(operation: (db: Queryable) => Promise<T>, auditAction?: string, filter: Record<string, string> = {}): Promise<T> {
    return authorised(async (db) => {
      const result = await operation(db);
      await recordMemberActivity(db, actor, deps.clock.now());
      return result;
    }, auditAction, filter);
  }
  return {
    interests: () => authorised((db) => listInterests(db, actor.organisationId)),
    updateInterest: (interestId, input) => command((db) => updateInterest(db, actor.organisationId, interestId, input)),
    splitInterestMerge: (id) => command((db) => splitInterestMerge(db, actor.organisationId, id, deps.clock.now())),
    approveInterestMerge: (id, survivingInterestId) => command((db) => approveInterestMerge(db, actor.organisationId, id, survivingInterestId, deps.clock.now())),
    interestMergeHistory: () => authorised((db) => readInterestMergeHistory(db, actor.organisationId)),
    interestMergeProposals: () => authorised((db) => readInterestMergeProposals(db, actor.organisationId)),
    proposeInterestMerges: async () => {
      const catalog = await authorised((db) => clusteringCatalog(db, actor.organisationId));
      const clusters = await requestInterestClusters(deps, catalog);
      await command((db) => saveInterestClusters(db, actor.organisationId, clusters, deps.clock.now()));
    },
    reports: (period, tableId) => authorised((db) => organisationReport(db, actor.organisationId, period, deps.clock.now(), tableId)),
    memberReport: (memberId, period) => authorised((db) => memberReport(db, actor, memberId, period, deps.clock.now()), "member-report", { memberId, ...period }),
    exportReport: async (table, period) => command(async (db) => exportReportTable(await organisationReport(db, actor.organisationId, period, deps.clock.now(), table), table),
      "aggregate-report-export", { table, ...period }),
    exportMemberReport: async (memberId, table, period) => command(async (db) => exportReportTable(await memberReport(db, actor, memberId, period, deps.clock.now(), table), table),
      "member-report-export", { memberId, table, ...period }),
    exportAuditLog: () => command(async (db) => tableCsv(auditTable(await readAdminAudit(db, actor.organisationId))), "audit-log-export"),
    exportRatings: () => command(async (db) => tableCsv(ratingsTable(await ratings(db, actor.organisationId))), "ratings-export"),
    exportMemberAttendance: (memberId) => command(async (db) => tableCsv(attendanceHistoryTable(await memberAttendance(db, actor, memberId, deps.clock.now()))), "member-attendance-export", { memberId }),
    upcomingOccurrences: () => authorised((db) => upcomingOccurrences(db, actor.organisationId, deps.clock.now()), "moderation-occurrences"),
    suspendMember: async (id) => {
      const ids = await command((db) => changeMemberAccess(db, actor, id, "suspend", deps.clock.now()));
      for (const gatheringId of ids) await deliverSoon(deps, { organisationId: actor.organisationId, gatheringId });
    },
    reinstateMember: async (id) => {
      await command((db) => changeMemberAccess(db, actor, id, "reinstate", deps.clock.now()));
    },
    cancelMeetup: (id) => cancel(id, "meetup"),
    cancelEvent: (id) => cancel(id, "event"),
    flags: (state = "open") => authorised((db) => readFlags(db, actor.organisationId, state), "flags", { state }),
    resolveFlag: (id, note) => command((db) => resolveFlag(db, actor, id, note, deps.clock.now())),
    ratings: () => authorised((db) => ratings(db, actor.organisationId)),
    memberAttendance: (memberId) => authorised((db) => memberAttendance(db, actor, memberId, deps.clock.now()), "member-attendance", { memberId }),
    createEvent: async (input) => {
      const event = await command((db) => createEvent(db, actor, input, deps.clock.now()));
      await deliverSoon(deps, { organisationId: actor.organisationId, gatheringId: event.id });
      return event;
    },
    eventProposals: () => authorised((db) => readEventProposals(db, actor, { administration: true }), "event-proposals"),
    events: () => authorised((db) => managedEvents(db, actor), "events"),
    approveEvent: async (id, note) => {
      await command((db) => approveEvent(db, actor, id, deps.clock.now(), note));
      await deliverSoon(deps, { organisationId: actor.organisationId, gatheringId: id });
    },
    rejectEvent: (id, note) => command((db) => rejectEvent(db, actor, id, note)),
    reassignEventHost: async (id, memberId) => {
      await command((db) => reassignEventHost(db, actor, id, memberId, deps.clock.now()));
      await deliverSoon(deps, { organisationId: actor.organisationId, gatheringId: id });
    },
    roster: () => authorised((db) => readRoster(db, actor.organisationId), "roster"),
    previewRoster: (rows) => authorised((db) => previewRoster(db, actor.organisationId, rows), "roster-preview"),
    commitRoster: async (rows, revision) => {
      const ids = await command((db) => commitRoster(db, actor.organisationId, rows, revision, deps.clock.now()));
      for (const gatheringId of ids) await deliverSoon(deps, { organisationId: actor.organisationId, gatheringId });
    },
    lists: () => authorised((db) => organisationLists(db, actor.organisationId)),
    createListEntry: (kind, name) =>
      command((db) => saveListEntry(db, actor.organisationId, kind, undefined, name, deps.clock.now())),
    renameListEntry: (kind, id, name) =>
      command((db) => saveListEntry(db, actor.organisationId, kind, id, name, deps.clock.now())),
    retireListEntry: (kind, id) => command((db) => retireListEntry(db, actor.organisationId, kind, id, deps.clock.now())),
    unknownLoginNotices: () =>
      authorised(
        (db) =>
          db
            .select({
              memberId: members.id,
              name: members.name,
              email: members.email,
              createdAt: organisationAdminNotices.createdAt,
            })
            .from(organisationAdminNotices)
            .innerJoin(
              members,
              and(
                eq(members.id, organisationAdminNotices.memberId),
                eq(members.organisationId, organisationAdminNotices.organisationId),
              ),
            )
            .where(
              and(
                eq(organisationAdminNotices.organisationId, actor.organisationId),
                eq(organisationAdminNotices.kind, "unknown_login"),
              ),
            )
            .orderBy(organisationAdminNotices.createdAt, members.email),
        "unknown-login-notices",
      ),
    auditLog: () => authorised((db) => readAdminAudit(db, actor.organisationId)),
  };
}

async function memberAttendance(db: Queryable, actor: Actor, memberId: string, now: Date): Promise<AttendanceHistoryEntry[]> {
  if (!isUuid(memberId)) throw new AccessDeniedError();
  const [member] = await db.select({ id: members.id }).from(members).where(and(eq(members.organisationId, actor.organisationId), eq(members.id, memberId)));
  if (!member) throw new AccessDeniedError();
  return readAttendanceHistory(db, { ...actor, memberId }, now);
}
