CREATE TABLE "attendance_members" (
	"organisation_id" uuid NOT NULL,
	"gathering_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"attended" boolean DEFAULT true NOT NULL,
	CONSTRAINT "attendance_members_organisation_id_gathering_id_member_id_pk" PRIMARY KEY("organisation_id","gathering_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"organisation_id" uuid NOT NULL,
	"gathering_id" uuid NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirmed_by_member_id" uuid,
	"prompted_host_member_id" uuid,
	CONSTRAINT "attendance_records_organisation_id_gathering_id_pk" PRIMARY KEY("organisation_id","gathering_id")
);
--> statement-breakpoint
CREATE TABLE "occurrence_ratings" (
	"organisation_id" uuid NOT NULL,
	"gathering_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"value" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "occurrence_ratings_organisation_id_gathering_id_member_id_pk" PRIMARY KEY("organisation_id","gathering_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "attendance_members" ADD CONSTRAINT "attendance_members_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_members" ADD CONSTRAINT "attendance_members_organisation_id_gathering_id_attendance_records_organisation_id_gathering_id_fk" FOREIGN KEY ("organisation_id","gathering_id") REFERENCES "public"."attendance_records"("organisation_id","gathering_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_members" ADD CONSTRAINT "attendance_members_organisation_id_member_id_members_organisation_id_id_fk" FOREIGN KEY ("organisation_id","member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_organisation_id_gathering_id_gatherings_organisation_id_id_fk" FOREIGN KEY ("organisation_id","gathering_id") REFERENCES "public"."gatherings"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_organisation_id_confirmed_by_member_id_members_organisation_id_id_fk" FOREIGN KEY ("organisation_id","confirmed_by_member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_organisation_id_prompted_host_member_id_members_organisation_id_id_fk" FOREIGN KEY ("organisation_id","prompted_host_member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence_ratings" ADD CONSTRAINT "occurrence_ratings_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence_ratings" ADD CONSTRAINT "occurrence_ratings_organisation_id_gathering_id_gatherings_organisation_id_id_fk" FOREIGN KEY ("organisation_id","gathering_id") REFERENCES "public"."gatherings"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrence_ratings" ADD CONSTRAINT "occurrence_ratings_organisation_id_member_id_members_organisation_id_id_fk" FOREIGN KEY ("organisation_id","member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_members_history_idx" ON "attendance_members" USING btree ("organisation_id","member_id","gathering_id");