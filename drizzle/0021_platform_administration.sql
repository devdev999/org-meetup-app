ALTER TABLE "organisation_oidc_settings" ADD COLUMN "credential_ref" text;
--> statement-breakpoint
UPDATE "organisation_oidc_settings" SET "credential_ref" = 'legacy-' || "organisations"."slug"
FROM "organisations" WHERE "organisations"."id" = "organisation_oidc_settings"."organisation_id"
AND "organisation_oidc_settings"."client_secret" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "organisation_oidc_settings" DROP COLUMN "client_secret";
--> statement-breakpoint
CREATE TABLE "platform_configuration" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"owner_organisation_id" uuid,
	CONSTRAINT "platform_configuration_singleton" CHECK ("platform_configuration"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "platform_configuration" ADD CONSTRAINT "platform_configuration_owner_organisation_id_organisations_id_fk" FOREIGN KEY ("owner_organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "platform_configuration" ("id", "owner_organisation_id")
VALUES (1, (SELECT "members"."organisation_id" FROM "members"
  INNER JOIN "organisations" ON "organisations"."id" = "members"."organisation_id"
  WHERE "members"."is_platform_admin" = true
  ORDER BY "organisations"."created_at", "organisations"."slug", "members"."created_at", "members"."id" LIMIT 1));
--> statement-breakpoint
UPDATE "members" SET "is_platform_admin" = false WHERE "is_platform_admin" = true
AND "organisation_id" <> (SELECT "owner_organisation_id" FROM "platform_configuration" WHERE "id" = 1);
--> statement-breakpoint
CREATE TABLE "ministries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ministries_nameKey_unique" UNIQUE("name_key")
);
--> statement-breakpoint
ALTER TABLE "organisations" ADD COLUMN "ministry_id" uuid;--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_ministry_id_ministries_id_fk" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organisations_ministry_idx" ON "organisations" USING btree ("ministry_id");
--> statement-breakpoint
ALTER TABLE "platform_configuration" ADD COLUMN "settings" jsonb;
--> statement-breakpoint
ALTER TABLE "recurrences" ADD COLUMN "time_zone" text DEFAULT 'UTC' NOT NULL;
--> statement-breakpoint
UPDATE event_proposals SET recurrence = recurrence || '{"timeZone":"UTC"}'::jsonb
WHERE recurrence IS NOT NULL AND NOT recurrence ? 'timeZone';
