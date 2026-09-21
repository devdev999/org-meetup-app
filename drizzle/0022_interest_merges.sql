CREATE SEQUENCE "public"."interest_change_order" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "interest_merge_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"interest_ids" uuid[] NOT NULL,
	"cluster_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"surviving_interest_id" uuid,
	"snapshot" jsonb,
	"merge_order" bigint,
	"merged_at" timestamp with time zone,
	"split_at" timestamp with time zone,
	CONSTRAINT "interest_merge_proposals_cluster_unique" UNIQUE("organisation_id","cluster_key")
);
--> statement-breakpoint
ALTER TABLE "gathering_interests" ADD COLUMN "revision" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "gathering_interests" ALTER COLUMN "revision" SET DEFAULT nextval('interest_change_order');--> statement-breakpoint
ALTER TABLE "interests" ADD COLUMN "merged_into_id" uuid;--> statement-breakpoint
ALTER TABLE "member_interests" ADD COLUMN "revision" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "member_interests" ALTER COLUMN "revision" SET DEFAULT nextval('interest_change_order');--> statement-breakpoint
ALTER TABLE "recurrence_interests" ADD COLUMN "revision" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "recurrence_interests" ALTER COLUMN "revision" SET DEFAULT nextval('interest_change_order');--> statement-breakpoint
ALTER TABLE "interest_merge_proposals" ADD CONSTRAINT "interest_merge_proposals_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_merge_proposals" ADD CONSTRAINT "interest_merge_proposals_organisation_id_surviving_interest_id_interests_organisation_id_id_fk" FOREIGN KEY ("organisation_id","surviving_interest_id") REFERENCES "public"."interests"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interests" ADD CONSTRAINT "interests_organisation_id_merged_into_id_interests_organisation_id_id_fk" FOREIGN KEY ("organisation_id","merged_into_id") REFERENCES "public"."interests"("organisation_id","id") ON DELETE no action ON UPDATE no action;
