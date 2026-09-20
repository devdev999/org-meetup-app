CREATE TABLE "gathering_rsvps" (
	"organisation_id" uuid NOT NULL,
	"gathering_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"answer" text,
	"prompted_at" timestamp with time zone,
	CONSTRAINT "gathering_rsvps_organisation_id_gathering_id_member_id_pk" PRIMARY KEY("organisation_id","gathering_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "gathering_rsvps" ADD CONSTRAINT "gathering_rsvps_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gathering_rsvps" ADD CONSTRAINT "gathering_rsvps_organisation_id_gathering_id_gatherings_organisation_id_id_fk" FOREIGN KEY ("organisation_id","gathering_id") REFERENCES "public"."gatherings"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gathering_rsvps" ADD CONSTRAINT "gathering_rsvps_organisation_id_member_id_members_organisation_id_id_fk" FOREIGN KEY ("organisation_id","member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;