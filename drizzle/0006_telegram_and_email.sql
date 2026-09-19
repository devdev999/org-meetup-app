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
ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_organisation_id_member_id_members_organisation_id_id_fk" FOREIGN KEY ("organisation_id","member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_organisation_id_member_id_members_organisation_id_id_fk" FOREIGN KEY ("organisation_id","member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;