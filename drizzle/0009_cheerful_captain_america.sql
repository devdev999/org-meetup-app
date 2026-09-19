CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"gathering_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "invites_gathering_member_unique" UNIQUE("organisation_id","gathering_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_organisation_id_gathering_id_gatherings_organisation_id_id_fk" FOREIGN KEY ("organisation_id","gathering_id") REFERENCES "public"."gatherings"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_organisation_id_member_id_members_organisation_id_id_fk" FOREIGN KEY ("organisation_id","member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;