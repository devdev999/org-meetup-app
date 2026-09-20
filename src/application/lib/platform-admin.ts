import { eq } from "drizzle-orm";
import { z } from "zod";
import { recordMemberActivity, requireActiveMember, type Actor } from "./actor";
import { auditTable, readAdminAudit, recordAdminView, type AdminAuditEntry } from "./admin-audit";
import type { Queryable } from "./departments-and-sites";
import type { Deps } from "./deps";
import { AccessDeniedError } from "./errors";
import { exportReportTable, tableCsv, type ReportCsv } from "./report-csv";
import { platformReport, type PlatformReportScope } from "./platform-reports";
import type { Report, ReportPeriod } from "./report-types";
import { createOrganisation, readPlatformOrganisations, setFirstOrganisationAdmin, type CreateOrganisationInput, type PlatformOrganisation } from "./platform-organisations";
import { organisations, platformConfiguration } from "./schema";
import { assignMinistry, createMinistry, readMinistries, type Ministry } from "./ministries";
import { readDeploymentSettings, updateDeploymentSettings, type DeploymentSettings } from "./deployment-settings";

export interface PlatformAdminActions {
  settings(): Promise<DeploymentSettings>;
  updateSettings(settings: DeploymentSettings): Promise<void>;
  reports(scope: PlatformReportScope, period: ReportPeriod): Promise<Report>;
  exportReport(scope: PlatformReportScope, tableId: string, period: ReportPeriod): Promise<ReportCsv>;
  createOrganisation(input: CreateOrganisationInput): Promise<PlatformOrganisation>;
  organisations(): Promise<PlatformOrganisation[]>;
  setFirstOrganisationAdmin(organisationId: string, input: CreateOrganisationInput["organisationAdmin"]): Promise<void>;
  createMinistry(name: string): Promise<Ministry>;
  ministries(): Promise<Ministry[]>;
  assignMinistry(organisationId: string, ministryId: string | null): Promise<void>;
  auditLog(): Promise<AdminAuditEntry[]>;
  exportAuditLog(): Promise<ReportCsv>;
}

const safeTableNames = new Set(["activation", "availability", "participation-departments", "participation-sites", "ratings", "rsvp-attendance",
  "shared-interests", "sought-interests", "telegram", "unmet-seeks", "waitlists", "weekly-occurrences",
  "member-profile", "member-counts", "member-connections", "member-availability", "member-interests", "member-flags", "member-attendance"]);

function safeFilters(filter: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(filter).filter(([key, value]) => {
    if (key === "from" || key === "to") return z.iso.date().safeParse(value).success;
    if (key === "table") return safeTableNames.has(value);
    if (key === "state") return value === "open" || value === "resolved";
    if (key === "placeKind") return value === "physical" || value === "virtual";
    if (key === "page") return /^(0|[1-9]\d{0,5})$/.test(value);
    if (key === "scopeKind") return value === "organisation" || value === "ministry";
    if (key === "scopeId") return z.uuid().safeParse(value).success;
    return false;
  }));
}

export async function platformAdmin(deps: Deps, actor: Actor): Promise<PlatformAdminActions> {
  async function requirePlatformAdmin(db: Queryable) {
    if (!(await requireActiveMember(db, actor)).isPlatformAdmin) throw new AccessDeniedError();
    const [configuration] = await db.select({ ownerOrganisationId: platformConfiguration.ownerOrganisationId }).from(platformConfiguration)
      .where(eq(platformConfiguration.id, 1));
    if (configuration?.ownerOrganisationId !== actor.organisationId) throw new AccessDeniedError();
  }
  await requirePlatformAdmin(deps.db);
  async function authorised<T>(operation: (db: Queryable) => Promise<T>): Promise<T> {
    return deps.db.transaction(async (db) => {
      await db.select({ id: organisations.id }).from(organisations).where(eq(organisations.id, actor.organisationId)).for("update");
      await requirePlatformAdmin(db);
      return operation(db);
    });
  }
  async function auditLog(db: Queryable) {
    return (await readAdminAudit(db)).map((entry) => ({ ...entry, filter: safeFilters(entry.filter) }));
  }
  function command<T>(operation: (db: Queryable) => Promise<T>): Promise<T> {
    return authorised(async (db) => {
      const result = await operation(db);
      await recordMemberActivity(db, actor, deps.clock.now());
      return result;
    });
  }
  return {
    settings: () => authorised((db) => readDeploymentSettings(db, deps.deploymentDefaults)),
    updateSettings: (settings) => command((db) => updateDeploymentSettings(db, settings)),
    reports: (scope, period) => authorised((db) => platformReport(db, scope, period, deps.clock.now())),
    exportReport: (scope, tableId, period) => command(async (db) => {
      const csv = exportReportTable(await platformReport(db, scope, period, deps.clock.now(), tableId), tableId);
      await recordAdminView(db, actor, { action: "platform-aggregate-report-export", filter: { scopeKind: scope.kind, scopeId: scope.id, table: tableId, ...period } }, deps.clock.now());
      return csv;
    }),
    createMinistry: (name) => command((db) => createMinistry(db, name, deps.clock.now())),
    ministries: () => authorised(readMinistries),
    assignMinistry: (organisationId, ministryId) => command((db) => assignMinistry(db, organisationId, ministryId)),
    createOrganisation: (input) => command((db) => createOrganisation(db, deps.identity, input, deps.clock.now())),
    setFirstOrganisationAdmin: (organisationId, input) => command((db) => setFirstOrganisationAdmin(db, organisationId, input, deps.clock.now())),
    organisations: () => authorised((db) => readPlatformOrganisations(db, deps.identity)),
    auditLog: () => authorised(auditLog),
    exportAuditLog: () => command(async (db) => {
      const csv = tableCsv(auditTable(await auditLog(db)));
      await recordAdminView(db, actor, { action: "platform-audit-log-export", filter: {} }, deps.clock.now());
      return csv;
    }),
  };
}
