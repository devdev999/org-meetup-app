CREATE TABLE "gathering_interests" (
	"organisation_id" uuid NOT NULL,
	"gathering_id" uuid NOT NULL,
	"interest_id" uuid NOT NULL,
	CONSTRAINT "gathering_interests_organisation_id_gathering_id_interest_id_pk" PRIMARY KEY("organisation_id","gathering_id","interest_id")
);
--> statement-breakpoint
ALTER TABLE "gathering_interests" ADD CONSTRAINT "gathering_interests_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gathering_interests" ADD CONSTRAINT "gathering_interests_organisation_id_gathering_id_gatherings_organisation_id_id_fk" FOREIGN KEY ("organisation_id","gathering_id") REFERENCES "public"."gatherings"("organisation_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gathering_interests" ADD CONSTRAINT "gathering_interests_organisation_id_interest_id_interests_organisation_id_id_fk" FOREIGN KEY ("organisation_id","interest_id") REFERENCES "public"."interests"("organisation_id","id") ON DELETE no action ON UPDATE no action;