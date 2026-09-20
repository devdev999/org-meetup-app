CREATE TABLE "flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"reporter_member_id" uuid NOT NULL,
	"target_kind" text NOT NULL,
	"target_member_id" uuid,
	"gathering_id" uuid,
	"reason" text NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"resolution_note" text,
	"resolved_at" timestamp with time zone,
	"resolved_by_member_id" uuid,
	CONSTRAINT "flags_target_check" CHECK (("flags"."target_kind" = 'member' and "flags"."target_member_id" is not null and "flags"."gathering_id" is null) or ("flags"."target_kind" in ('meetup', 'event') and "flags"."target_member_id" is null and "flags"."gathering_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "status_before_suspension" text;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_organisation_id_reporter_member_id_members_organisation_id_id_fk" FOREIGN KEY ("organisation_id","reporter_member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_organisation_id_target_member_id_members_organisation_id_id_fk" FOREIGN KEY ("organisation_id","target_member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_organisation_id_gathering_id_gatherings_organisation_id_id_fk" FOREIGN KEY ("organisation_id","gathering_id") REFERENCES "public"."gatherings"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_organisation_id_resolved_by_member_id_members_organisation_id_id_fk" FOREIGN KEY ("organisation_id","resolved_by_member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flags_queue_idx" ON "flags" USING btree ("organisation_id","state","created_at");--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_before_suspension_check" CHECK ("members"."status_before_suspension" is null or "members"."status_before_suspension" in ('provisioned', 'active'));