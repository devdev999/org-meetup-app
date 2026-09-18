import { and, eq, ne } from "drizzle-orm";
import { nameKey, type Queryable } from "./departments-and-sites";
import { InvalidInputError } from "./errors";
import { isUuid } from "./input";
import { activities, departments, sites } from "./schema";

export type OrganisationListKind = "department" | "site" | "activity";
export interface OrganisationListEntry {
  id: string;
  name: string;
  retired: boolean;
}
export interface OrganisationLists {
  departments: OrganisationListEntry[];
  sites: OrganisationListEntry[];
  activities: OrganisationListEntry[];
}

const tables = { department: departments, site: sites, activity: activities };
const columns = (table: typeof departments | typeof sites | typeof activities) => ({
  id: table.id,
  name: table.name,
  retired: table.retired,
});

function tableFor(kind: OrganisationListKind) {
  if (kind !== "department" && kind !== "site" && kind !== "activity") {
    throw new InvalidInputError("invalid-list-entry", "choose Departments, Sites or Activities");
  }
  return tables[kind];
}

export async function organisationLists(db: Queryable, organisationId: string): Promise<OrganisationLists> {
  const read = (table: ReturnType<typeof tableFor>) =>
    db.select(columns(table)).from(table).where(eq(table.organisationId, organisationId)).orderBy(table.name);
  const departmentRows = await read(departments);
  const siteRows = await read(sites);
  const activityRows = await read(activities);
  return { departments: departmentRows, sites: siteRows, activities: activityRows };
}

export async function saveListEntry(
  db: Queryable,
  organisationId: string,
  kind: OrganisationListKind,
  id: string | undefined,
  input: string,
  now: Date,
): Promise<OrganisationListEntry> {
  const table = tableFor(kind);
  const name = input.trim();
  if (!name || (id !== undefined && !isUuid(id)))
    throw new InvalidInputError("invalid-list-entry", "supply a name and a valid entry");
  const [duplicate] = await db
    .select({ id: table.id })
    .from(table)
    .where(
      and(
        eq(table.organisationId, organisationId),
        eq(table.nameKey, nameKey(name)),
        id ? ne(table.id, id) : undefined,
      ),
    );
  if (duplicate) throw new InvalidInputError("duplicate-list-entry", "this name is already in the Organisation's list");
  const [saved] =
    id === undefined
      ? await db
          .insert(table)
          .values({ organisationId, name, nameKey: nameKey(name), createdAt: now })
          .returning(columns(table))
      : await db
          .update(table)
          .set({ name, nameKey: nameKey(name) })
          .where(and(eq(table.organisationId, organisationId), eq(table.id, id)))
          .returning(columns(table));
  if (!saved) throw new InvalidInputError("invalid-list-entry", "this entry does not belong to the Organisation");
  return saved;
}

export async function retireListEntry(
  db: Queryable,
  organisationId: string,
  kind: OrganisationListKind,
  id: string,
): Promise<void> {
  const table = tableFor(kind);
  if (!isUuid(id)) throw new InvalidInputError("invalid-list-entry", "choose an entry from the Organisation's list");
  const [retired] = await db
    .update(table)
    .set({ retired: true })
    .where(and(eq(table.organisationId, organisationId), eq(table.id, id)))
    .returning({ id: table.id });
  if (!retired) throw new InvalidInputError("invalid-list-entry", "this entry does not belong to the Organisation");
}

export async function seedActivities(db: Queryable, organisationId: string, now: Date): Promise<void> {
  const [existing] = await db
    .select({ id: activities.id })
    .from(activities)
    .where(eq(activities.organisationId, organisationId))
    .limit(1);
  if (existing) return;
  await db.insert(activities).values(
    ["coffee", "lunch", "walk", "game", "sport", "learning session", "other"].map((name) => ({
      organisationId,
      name,
      nameKey: name,
      createdAt: now,
    })),
  );
}
