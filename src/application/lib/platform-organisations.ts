import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { IdentityPort } from "../ports";
import { normaliseEmail } from "./db";
import type { Queryable } from "./departments-and-sites";
import { InvalidInputError } from "./errors";
import { isUuid } from "./input";
import { seedInterests } from "./interests";
import { seedActivities } from "./organisation-lists";
import { members, organisationOidcSettings, organisations } from "./schema";

const name = z.string().trim().min(1).max(120);
export const createOrganisationSchema = z.strictObject({
  organisation: z.strictObject({ slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80), name }),
  oidc: z.strictObject({ issuer: z.url({ protocol: /^https?$/ }).refine((value) => !new URL(value).username && !new URL(value).password),
    clientId: name, credentialRef: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/).nullable(),
    claimMapping: z.strictObject({ email: name, name, department: name.optional(), site: name.optional(), staffIdentifier: name.optional() }) }),
  organisationAdmin: z.strictObject({ email: z.email(), name }),
});

export type CreateOrganisationInput = z.infer<typeof createOrganisationSchema>;
export interface PlatformOrganisation {
  id: string;
  slug: string;
  name: string;
  oidc: CreateOrganisationInput["oidc"];
  signInReady: boolean;
  hasOrganisationAdmin: boolean;
  ministryId: string | null;
}

export async function createOrganisation(db: Queryable, identity: IdentityPort, input: CreateOrganisationInput, now: Date): Promise<PlatformOrganisation> {
  const parsed = createOrganisationSchema.safeParse(input);
  if (!parsed.success) throw new InvalidInputError("invalid-organisation", "Supply the Organisation, issuer and first Organisation Admin details.");
  const data = parsed.data;
  const organisation = await insertOrganisation(db, data, now);
  await setFirstOrganisationAdmin(db, organisation.id, data.organisationAdmin, now);
  return { ...organisation, oidc: data.oidc, signInReady: identity.isConfigured(data.oidc), hasOrganisationAdmin: true };
}

export async function insertOrganisation(db: Queryable, data: Pick<CreateOrganisationInput, "organisation" | "oidc">, now: Date) {
  const [organisation] = await db.insert(organisations).values({ ...data.organisation, createdAt: now })
    .onConflictDoNothing().returning({ id: organisations.id, slug: organisations.slug, name: organisations.name, ministryId: organisations.ministryId });
  if (!organisation) throw new InvalidInputError("invalid-organisation", "Choose an unused Organisation address.");
  await db.insert(organisationOidcSettings).values({ organisationId: organisation.id, issuer: data.oidc.issuer,
    clientId: data.oidc.clientId, credentialRef: data.oidc.credentialRef, claimMapping: data.oidc.claimMapping, updatedAt: now });
  await seedInterests(db, organisation.id, now);
  await seedActivities(db, organisation.id, now);
  return organisation;
}

export async function readPlatformOrganisations(db: Queryable, identity: IdentityPort): Promise<PlatformOrganisation[]> {
  const rows = await db.select({ id: organisations.id, slug: organisations.slug, name: organisations.name, ministryId: organisations.ministryId,
    hasOrganisationAdmin: sql<boolean>`exists (select 1 from ${members} where ${members.organisationId} = ${organisations.id} and ${members.isOrganisationAdmin} = true)`,
    issuer: organisationOidcSettings.issuer, clientId: organisationOidcSettings.clientId,
    credentialRef: organisationOidcSettings.credentialRef, claimMapping: organisationOidcSettings.claimMapping })
    .from(organisations).innerJoin(organisationOidcSettings, eq(organisationOidcSettings.organisationId, organisations.id)).orderBy(organisations.name);
  return rows.map(({ issuer, clientId, claimMapping, credentialRef, ...organisation }) => ({ ...organisation,
    oidc: { issuer, clientId, claimMapping, credentialRef }, signInReady: identity.isConfigured({ issuer, clientId, credentialRef }) }));
}

export async function setFirstOrganisationAdmin(db: Queryable, organisationId: string, input: CreateOrganisationInput["organisationAdmin"], now: Date): Promise<void> {
  const parsed = createOrganisationSchema.shape.organisationAdmin.safeParse(input);
  if (!isUuid(organisationId) || !parsed.success) throw new InvalidInputError("invalid-organisation", "Choose an Organisation and supply its first Organisation Admin.");
  const [organisation] = await db.select({ id: organisations.id }).from(organisations).where(eq(organisations.id, organisationId)).for("update");
  if (!organisation) throw new InvalidInputError("invalid-organisation", "Choose an existing Organisation.");
  const email = normaliseEmail(parsed.data.email);
  const [admin] = await db.select({ email: members.email }).from(members)
    .where(and(eq(members.organisationId, organisationId), eq(members.isOrganisationAdmin, true))).limit(1);
  if (admin?.email === email) return;
  if (admin) throw new InvalidInputError("invalid-organisation", "This Organisation already has an Organisation Admin.");
  const [existing] = await db.select({ status: members.status }).from(members).where(and(eq(members.organisationId, organisationId), eq(members.email, email)));
  if (existing?.status === "suspended" || existing?.status === "departed") {
    throw new InvalidInputError("invalid-organisation", "Choose a Member who has access to the Organisation.");
  }
  await db.insert(members).values({ organisationId, email, name: parsed.data.name,
    status: "provisioned", isOrganisationAdmin: true, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: [members.organisationId, members.email], set: { isOrganisationAdmin: true, updatedAt: now } });
}
