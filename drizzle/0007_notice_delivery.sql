CREATE TABLE "notice_deliveries" (
	"organisation_id" uuid NOT NULL,
	"notice_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"mode" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "notice_deliveries_organisation_id_notice_id_channel_pk" PRIMARY KEY("organisation_id","notice_id","channel")
);
--> statement-breakpoint
ALTER TABLE "notices" ADD COLUMN "external_message" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_organisation_id_id_unique" UNIQUE("organisation_id","id");--> statement-breakpoint
ALTER TABLE "notice_deliveries" ADD CONSTRAINT "notice_deliveries_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_deliveries" ADD CONSTRAINT "notice_deliveries_organisation_id_notice_id_notices_organisation_id_id_fk" FOREIGN KEY ("organisation_id","notice_id") REFERENCES "public"."notices"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
