CREATE TYPE "public"."gathering_kind" AS ENUM('meetup', 'event');--> statement-breakpoint
CREATE TYPE "public"."gathering_status" AS ENUM('scheduled', 'cancelled', 'completed', 'proposed', 'rejected');--> statement-breakpoint
CREATE TABLE "gathering_members" (
	"organisation_id" uuid NOT NULL,
	"gathering_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"status" text NOT NULL,
	"position" serial NOT NULL,
	CONSTRAINT "gathering_members_organisation_id_gathering_id_member_id_pk" PRIMARY KEY("organisation_id","gathering_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "gatherings" (
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
	"status" "gathering_status" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "gatherings_organisation_id_id_unique" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"gathering_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"position" serial NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gathering_members" ADD CONSTRAINT "gathering_members_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gathering_members" ADD CONSTRAINT "gathering_members_organisation_id_gathering_id_gatherings_organisation_id_id_fk" FOREIGN KEY ("organisation_id","gathering_id") REFERENCES "public"."gatherings"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gathering_members" ADD CONSTRAINT "gathering_members_organisation_id_member_id_members_organisation_id_id_fk" FOREIGN KEY ("organisation_id","member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatherings" ADD CONSTRAINT "gatherings_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatherings" ADD CONSTRAINT "gatherings_organisation_id_host_member_id_members_organisation_id_id_fk" FOREIGN KEY ("organisation_id","host_member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatherings" ADD CONSTRAINT "gatherings_organisation_id_activity_id_activities_organisation_id_id_fk" FOREIGN KEY ("organisation_id","activity_id") REFERENCES "public"."activities"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatherings" ADD CONSTRAINT "gatherings_organisation_id_place_site_id_sites_organisation_id_id_fk" FOREIGN KEY ("organisation_id","place_site_id") REFERENCES "public"."sites"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatherings" ADD CONSTRAINT "gatherings_organisation_id_audience_site_id_sites_organisation_id_id_fk" FOREIGN KEY ("organisation_id","audience_site_id") REFERENCES "public"."sites"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_organisation_id_member_id_members_organisation_id_id_fk" FOREIGN KEY ("organisation_id","member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_organisation_id_gathering_id_gatherings_organisation_id_id_fk" FOREIGN KEY ("organisation_id","gathering_id") REFERENCES "public"."gatherings"("organisation_id","id") ON DELETE no action ON UPDATE no action;