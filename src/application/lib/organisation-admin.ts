import { and, eq } from "drizzle-orm";
import { requireActiveMember, type Actor } from "./actor";
import { recordAdminView } from "./admin-audit";
import type { Queryable } from "./departments-and-sites";
import type { Deps } from "./deps";
import { AccessDeniedError } from "./errors";
import { approveEvent, createEvent, managedEvents, readEventProposals, reassignEventHost, rejectEvent, type EventProposal, type ManagedEvent } from "./events";
import type { CreateEventInput, EventDetail } from "./meetups";
import { deliverSoon } from "./notifications";
import {
  commitRoster,
  previewRoster,
  readRoster,
  type RosterMember,
  type RosterPreview,
  type RosterRow,
} from "./roster";
import { adminAuditEntries, members, organisationAdminNotices, organisations } from "./schema";
import {
  organisationLists,
  retireListEntry,
  saveListEntry,
  type OrganisationListEntry,
  type OrganisationListKind,
  type OrganisationLists,
} from "./organisation-lists";

export interface OrganisationAdminActions {
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

export type AdminAuditEntry = Pick<
  typeof adminAuditEntries.$inferSelect,
  "id" | "actorMemberId" | "action" | "filter" | "createdAt"
> & { actorName: string };

export async function organisationAdmin(deps: Deps, actor: Actor): Promise<OrganisationAdminActions> {
  async function requireAdmin(db: Queryable) {
    const member = await requireActiveMember(db, actor);
    if (!member.isOrganisationAdmin) throw new AccessDeniedError();
  }
  await requireAdmin(deps.db);

  async function authorised<T>(operation: (db: Queryable) => Promise<T>, auditAction?: string): Promise<T> {
    return deps.db.transaction(async (tx) => {
      await tx
        .select({ id: organisations.id })
        .from(organisations)
        .where(eq(organisations.id, actor.organisationId))
        .for("update");
      await requireAdmin(tx);
      const result = await operation(tx);
      if (auditAction)
        await recordAdminView(tx, actor, { action: auditAction, filter: {} }, deps.clock.now());
      return result;
    });
  }
  return {
    createEvent: async (input) => {
      const event = await authorised((db) => createEvent(db, actor, input, deps.clock.now()));
      await deliverSoon(deps, { organisationId: actor.organisationId, gatheringId: event.id });
      return event;
    },
    eventProposals: () => authorised((db) => readEventProposals(db, actor, { administration: true }), "event-proposals"),
    events: () => authorised((db) => managedEvents(db, actor), "events"),
    approveEvent: async (id, note) => {
      await authorised((db) => approveEvent(db, actor, id, deps.clock.now(), note));
      await deliverSoon(deps, { organisationId: actor.organisationId, gatheringId: id });
    },
    rejectEvent: (id, note) => authorised((db) => rejectEvent(db, actor, id, note)),
    reassignEventHost: async (id, memberId) => {
      await authorised((db) => reassignEventHost(db, actor, id, memberId, deps.clock.now()));
      await deliverSoon(deps, { organisationId: actor.organisationId, gatheringId: id });
    },
    roster: () => authorised((db) => readRoster(db, actor.organisationId), "roster"),
    previewRoster: (rows) => authorised((db) => previewRoster(db, actor.organisationId, rows), "roster-preview"),
    commitRoster: (rows, revision) =>
      authorised((db) => commitRoster(db, actor.organisationId, rows, revision, deps.clock.now())),
    lists: () => authorised((db) => organisationLists(db, actor.organisationId)),
    createListEntry: (kind, name) =>
      authorised((db) => saveListEntry(db, actor.organisationId, kind, undefined, name, deps.clock.now())),
    renameListEntry: (kind, id, name) =>
      authorised((db) => saveListEntry(db, actor.organisationId, kind, id, name, deps.clock.now())),
    retireListEntry: (kind, id) => authorised((db) => retireListEntry(db, actor.organisationId, kind, id)),
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
    auditLog: () =>
      authorised((db) =>
        db
          .select({
            id: adminAuditEntries.id,
            actorMemberId: adminAuditEntries.actorMemberId,
            action: adminAuditEntries.action,
            filter: adminAuditEntries.filter,
            createdAt: adminAuditEntries.createdAt,
            actorName: members.name,
          })
          .from(adminAuditEntries)
          .innerJoin(
            members,
            and(
              eq(members.id, adminAuditEntries.actorMemberId),
              eq(members.organisationId, adminAuditEntries.organisationId),
            ),
          )
          .where(eq(adminAuditEntries.organisationId, actor.organisationId))
          .orderBy(adminAuditEntries.createdAt, adminAuditEntries.id),
      ),
  };
}
