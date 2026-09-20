CREATE TABLE "recurrence_interests" (
	"organisation_id" uuid NOT NULL,
	"recurrence_id" uuid NOT NULL,
	"interest_id" uuid NOT NULL,
	CONSTRAINT "recurrence_interests_organisation_id_recurrence_id_interest_id_pk" PRIMARY KEY("organisation_id","recurrence_id","interest_id")
);
--> statement-breakpoint
CREATE TABLE "recurrence_members" (
	"organisation_id" uuid NOT NULL,
	"recurrence_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"position" serial NOT NULL,
	CONSTRAINT "recurrence_members_organisation_id_recurrence_id_member_id_pk" PRIMARY KEY("organisation_id","recurrence_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "recurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"kind" "gathering_kind" NOT NULL,
	"host_member_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"place_kind" text NOT NULL,
	"place_site_id" uuid,
	"place_spot" text,
	"place_url" text,
	"capacity" integer NOT NULL,
	"audience_kind" text NOT NULL,
	"audience_scope" text,
	"audience_site_id" uuid,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"frequency" text NOT NULL,
	"ends_on" date,
	"stopped_at" timestamp with time zone,
	CONSTRAINT "recurrences_organisation_id_id_unique" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
ALTER TABLE "gatherings" ADD COLUMN "recurrence_id" uuid;--> statement-breakpoint
ALTER TABLE "gatherings" ADD COLUMN "scheduled_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recurrence_interests" ADD CONSTRAINT "recurrence_interests_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_interests" ADD CONSTRAINT "recurrence_interests_organisation_id_recurrence_id_recurrences_organisation_id_id_fk" FOREIGN KEY ("organisation_id","recurrence_id") REFERENCES "public"."recurrences"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_interests" ADD CONSTRAINT "recurrence_interests_organisation_id_interest_id_interests_organisation_id_id_fk" FOREIGN KEY ("organisation_id","interest_id") REFERENCES "public"."interests"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_members" ADD CONSTRAINT "recurrence_members_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_members" ADD CONSTRAINT "recurrence_members_organisation_id_recurrence_id_recurrences_organisation_id_id_fk" FOREIGN KEY ("organisation_id","recurrence_id") REFERENCES "public"."recurrences"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrence_members" ADD CONSTRAINT "recurrence_members_organisation_id_member_id_members_organisation_id_id_fk" FOREIGN KEY ("organisation_id","member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_organisation_id_host_member_id_members_organisation_id_id_fk" FOREIGN KEY ("organisation_id","host_member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_organisation_id_activity_id_activities_organisation_id_id_fk" FOREIGN KEY ("organisation_id","activity_id") REFERENCES "public"."activities"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_organisation_id_place_site_id_sites_organisation_id_id_fk" FOREIGN KEY ("organisation_id","place_site_id") REFERENCES "public"."sites"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_organisation_id_audience_site_id_sites_organisation_id_id_fk" FOREIGN KEY ("organisation_id","audience_site_id") REFERENCES "public"."sites"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurrences_active_idx" ON "recurrences" USING btree ("organisation_id","starts_at") WHERE "recurrences"."stopped_at" is null;--> statement-breakpoint
ALTER TABLE "gatherings" ADD CONSTRAINT "gatherings_organisation_id_recurrence_id_recurrences_organisation_id_id_fk" FOREIGN KEY ("organisation_id","recurrence_id") REFERENCES "public"."recurrences"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatherings" ADD CONSTRAINT "gatherings_recurrence_occurrence_unique" UNIQUE("organisation_id","recurrence_id","scheduled_starts_at");