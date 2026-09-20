import { eq } from "drizzle-orm";
import { z } from "zod";
import { nameKey, type Queryable } from "./departments-and-sites";
import { InvalidInputError } from "./errors";
import { isUuid } from "./input";
import { ministries, organisations } from "./schema";

export interface Ministry { id: string; name: string }

export async function createMinistry(db: Queryable, input: string, now: Date): Promise<Ministry> {
  const parsed = z.string().trim().min(1).max(120).safeParse(input);
  if (!parsed.success) throw new InvalidInputError("invalid-ministry", "Supply a Ministry name.");
  const [ministry] = await db.insert(ministries).values({ name: parsed.data, nameKey: nameKey(parsed.data), createdAt: now })
    .onConflictDoNothing().returning({ id: ministries.id, name: ministries.name });
  if (!ministry) throw new InvalidInputError("invalid-ministry", "This Ministry name is already in use.");
  return ministry;
}

export function readMinistries(db: Queryable): Promise<Ministry[]> {
  return db.select({ id: ministries.id, name: ministries.name }).from(ministries).orderBy(ministries.name);
}

export async function assignMinistry(db: Queryable, organisationId: string, ministryId: string | null): Promise<void> {
  if (!isUuid(organisationId) || ministryId !== null && !isUuid(ministryId)) throw new InvalidInputError("invalid-ministry", "Choose an Organisation and a Ministry.");
  if (ministryId !== null) {
    const [ministry] = await db.select({ id: ministries.id }).from(ministries).where(eq(ministries.id, ministryId));
    if (!ministry) throw new InvalidInputError("invalid-ministry", "Choose an existing Ministry.");
  }
  const [organisation] = await db.update(organisations).set({ ministryId }).where(eq(organisations.id, organisationId)).returning({ id: organisations.id });
  if (!organisation) throw new InvalidInputError("invalid-ministry", "Choose an existing Organisation.");
}
