ALTER TABLE "interest_aliases" ADD COLUMN "phrase_key" text;--> statement-breakpoint
UPDATE "interest_aliases" SET "phrase_key" = lower(regexp_replace("phrase", '^[[:space:]]+|[[:space:]]+$', '', 'g'));--> statement-breakpoint
ALTER TABLE "interest_aliases" ALTER COLUMN "phrase_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "interest_aliases" DROP CONSTRAINT "interest_aliases_organisation_id_interest_id_phrase_pk";--> statement-breakpoint
ALTER TABLE "interest_aliases" ADD CONSTRAINT "interest_aliases_organisation_id_phrase_key_pk" PRIMARY KEY("organisation_id","phrase_key");
