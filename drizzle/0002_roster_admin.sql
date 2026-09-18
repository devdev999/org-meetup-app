ALTER TABLE "members" ADD COLUMN "is_organisation_admin" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"retired" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "activities_organisation_id_id_unique" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
CREATE TABLE "site_shares" (
	"organisation_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"shared_with_organisation_id" uuid NOT NULL,
	CONSTRAINT "site_shares_organisation_id_site_id_shared_with_organisation_id_pk" PRIMARY KEY("organisation_id","site_id","shared_with_organisation_id")
);
--> statement-breakpoint
ALTER TABLE "departments" ADD COLUMN "retired" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "retired" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_shares" ADD CONSTRAINT "site_shares_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_shares" ADD CONSTRAINT "site_shares_shared_with_organisation_id_organisations_id_fk" FOREIGN KEY ("shared_with_organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_shares" ADD CONSTRAINT "site_shares_site_same_organisation_fk" FOREIGN KEY ("organisation_id","site_id") REFERENCES "public"."sites"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activities_organisation_name_key_unique" ON "activities" USING btree ("organisation_id","name_key");
--> statement-breakpoint
INSERT INTO "activities" ("organisation_id", "name", "name_key", "created_at")
SELECT "organisations"."id", starter.name, starter.name, now()
FROM "organisations"
CROSS JOIN (VALUES ('coffee'), ('lunch'), ('walk'), ('game'), ('sport'), ('learning session'), ('other')) AS starter(name);

--> statement-breakpoint
CREATE TABLE "admin_audit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"actor_member_id" uuid NOT NULL,
	"action" text NOT NULL,
	"filter" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_audit_entries" ADD CONSTRAINT "admin_audit_entries_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_entries" ADD CONSTRAINT "admin_audit_entries_actor_same_organisation_fk" FOREIGN KEY ("organisation_id","actor_member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;
