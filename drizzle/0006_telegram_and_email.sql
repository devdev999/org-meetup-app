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
CREATE TABLE "notice_preferences" (
	"organisation_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"telegram" boolean NOT NULL,
	"email" boolean NOT NULL,
	CONSTRAINT "notice_preferences_organisation_id_member_id_kind_pk" PRIMARY KEY("organisation_id","member_id","kind")
);
--> statement-breakpoint
CREATE TABLE "telegram_link_codes" (
	"organisation_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "telegram_link_codes_organisation_id_member_id_pk" PRIMARY KEY("organisation_id","member_id"),
	CONSTRAINT "telegram_link_codes_codeHash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "telegram_links" (
	"organisation_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"chat_id" text NOT NULL,
	CONSTRAINT "telegram_links_organisation_id_member_id_pk" PRIMARY KEY("organisation_id","member_id"),
	CONSTRAINT "telegram_links_chatId_unique" UNIQUE("chat_id")
);
--> statement-breakpoint
ALTER TABLE "notices" ADD COLUMN "external_message" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_organisation_id_id_unique" UNIQUE("organisation_id","id");--> statement-breakpoint
ALTER TABLE "notice_deliveries" ADD CONSTRAINT "notice_deliveries_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_deliveries" ADD CONSTRAINT "notice_deliveries_organisation_id_notice_id_notices_organisation_id_id_fk" FOREIGN KEY ("organisation_id","notice_id") REFERENCES "public"."notices"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_preferences" ADD CONSTRAINT "notice_preferences_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice_preferences" ADD CONSTRAINT "notice_preferences_organisation_id_member_id_members_organisation_id_id_fk" FOREIGN KEY ("organisation_id","member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_organisation_id_member_id_members_organisation_id_id_fk" FOREIGN KEY ("organisation_id","member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_organisation_id_member_id_members_organisation_id_id_fk" FOREIGN KEY ("organisation_id","member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notice_deliveries_pending_idx" ON "notice_deliveries" USING btree ("mode","available_at") WHERE "notice_deliveries"."finished_at" is null;
