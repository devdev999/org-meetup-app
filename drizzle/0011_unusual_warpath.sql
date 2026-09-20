CREATE TABLE "availabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"site_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"expired_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_notice_pairs" (
	"organisation_id" uuid NOT NULL,
	"first_member_id" uuid NOT NULL,
	"second_member_id" uuid NOT NULL,
	"day" text NOT NULL,
	CONSTRAINT "availability_notice_pairs_organisation_id_first_member_id_second_member_id_day_pk" PRIMARY KEY("organisation_id","first_member_id","second_member_id","day")
);
--> statement-breakpoint
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_organisation_id_member_id_members_organisation_id_id_fk" FOREIGN KEY ("organisation_id","member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_organisation_id_activity_id_activities_organisation_id_id_fk" FOREIGN KEY ("organisation_id","activity_id") REFERENCES "public"."activities"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_organisation_id_site_id_sites_organisation_id_id_fk" FOREIGN KEY ("organisation_id","site_id") REFERENCES "public"."sites"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_notice_pairs" ADD CONSTRAINT "availability_notice_pairs_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_notice_pairs" ADD CONSTRAINT "availability_notice_pairs_organisation_id_first_member_id_members_organisation_id_id_fk" FOREIGN KEY ("organisation_id","first_member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_notice_pairs" ADD CONSTRAINT "availability_notice_pairs_organisation_id_second_member_id_members_organisation_id_id_fk" FOREIGN KEY ("organisation_id","second_member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availabilities_open_idx" ON "availabilities" USING btree ("organisation_id","ends_at") WHERE "availabilities"."expired_at" is null;