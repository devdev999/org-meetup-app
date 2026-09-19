CREATE TABLE "notice_preferences" (
	"organisation_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"telegram" boolean NOT NULL,
	"email" boolean NOT NULL,
	CONSTRAINT "notice_preferences_organisation_id_member_id_kind_pk" PRIMARY KEY("organisation_id","member_id","kind")
);
--> statement-breakpoint
ALTER TABLE "notice_preferences" ADD CONSTRAINT "notice_preferences_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_preferences" ADD CONSTRAINT "notice_preferences_organisation_id_member_id_members_organisation_id_id_fk" FOREIGN KEY ("organisation_id","member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;