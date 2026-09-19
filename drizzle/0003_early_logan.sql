CREATE TYPE "public"."interest_kind" AS ENUM('skill', 'hobby');--> statement-breakpoint
CREATE TYPE "public"."stance" AS ENUM('shares', 'seeks');--> statement-breakpoint
CREATE TABLE "interest_aliases" (
	"organisation_id" uuid NOT NULL,
	"interest_id" uuid NOT NULL,
	"phrase" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "interest_aliases_organisation_id_interest_id_phrase_pk" PRIMARY KEY("organisation_id","interest_id","phrase")
);
--> statement-breakpoint
CREATE TABLE "interests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"kind" "interest_kind" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "interests_organisation_id_id_unique" UNIQUE("organisation_id","id")
);
--> statement-breakpoint
CREATE TABLE "member_interests" (
	"organisation_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"interest_id" uuid NOT NULL,
	"stance" "stance" NOT NULL,
	CONSTRAINT "member_interests_organisation_id_member_id_interest_id_pk" PRIMARY KEY("organisation_id","member_id","interest_id")
);
--> statement-breakpoint
ALTER TABLE "interest_aliases" ADD CONSTRAINT "interest_aliases_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_aliases" ADD CONSTRAINT "interest_aliases_interest_same_organisation_fk" FOREIGN KEY ("organisation_id","interest_id") REFERENCES "public"."interests"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interests" ADD CONSTRAINT "interests_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_interests" ADD CONSTRAINT "member_interests_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_interests" ADD CONSTRAINT "member_interests_member_same_organisation_fk" FOREIGN KEY ("organisation_id","member_id") REFERENCES "public"."members"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_interests" ADD CONSTRAINT "member_interests_interest_same_organisation_fk" FOREIGN KEY ("organisation_id","interest_id") REFERENCES "public"."interests"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "interests_organisation_name_key_unique" ON "interests" USING btree ("organisation_id","name_key");