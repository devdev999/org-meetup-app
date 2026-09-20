CREATE TABLE "event_organisations" (
	"organisation_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"opened_to_organisation_id" uuid NOT NULL,
	CONSTRAINT "event_organisations_organisation_id_event_id_opened_to_organisation_id_pk" PRIMARY KEY("organisation_id","event_id","opened_to_organisation_id")
);
--> statement-breakpoint
CREATE TABLE "event_proposals" (
	"organisation_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"proposer_member_id" uuid NOT NULL,
	"state" text DEFAULT 'proposed' NOT NULL,
	"note" text,
	"recurrence" jsonb,
	"invited_member_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	CONSTRAINT "event_proposals_organisation_id_event_id_pk" PRIMARY KEY("organisation_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "gatherings" ALTER COLUMN "capacity" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recurrences" ALTER COLUMN "capacity" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "event_organisations" ADD CONSTRAINT "event_organisations_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_organisations" ADD CONSTRAINT "event_organisations_opened_to_organisation_id_organisations_id_fk" FOREIGN KEY ("opened_to_organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_organisations" ADD CONSTRAINT "event_organisations_organisation_id_event_id_gatherings_organisation_id_id_fk" FOREIGN KEY ("organisation_id","event_id") REFERENCES "public"."gatherings"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_proposals" ADD CONSTRAINT "event_proposals_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_proposals" ADD CONSTRAINT "event_proposals_organisation_id_event_id_gatherings_organisation_id_id_fk" FOREIGN KEY ("organisation_id","event_id") REFERENCES "public"."gatherings"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_proposals" ADD CONSTRAINT "event_proposals_organisation_id_proposer_member_id_members_organisation_id_id_fk" FOREIGN KEY ("organisation_id","proposer_member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;