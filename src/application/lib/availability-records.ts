import { and, eq, isNull, notExists, or } from "drizzle-orm";
import type { Queryable } from "./departments-and-sites";
import { activities, availabilities, members, sites } from "./schema";

export const availabilityEligibility = and(
  eq(members.status, "active"), eq(activities.retired, false),
  or(isNull(availabilities.siteId), and(eq(availabilities.siteId, members.siteId), eq(sites.retired, false))),
);

export async function expireIneligibleAvailabilities(db: Queryable, organisationId: string, now: Date): Promise<void> {
  const eligible = db.select({ id: members.id }).from(members)
    .innerJoin(activities, and(eq(activities.organisationId, members.organisationId), eq(activities.id, availabilities.activityId)))
    .leftJoin(sites, and(eq(sites.organisationId, members.organisationId), eq(sites.id, availabilities.siteId)))
    .where(and(eq(members.organisationId, availabilities.organisationId), eq(members.id, availabilities.memberId), availabilityEligibility));
  await db.update(availabilities).set({ expiredAt: now }).where(and(
    eq(availabilities.organisationId, organisationId), isNull(availabilities.expiredAt), notExists(eligible),
  ));
}
