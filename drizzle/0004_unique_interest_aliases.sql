ALTER TABLE "interest_aliases" ADD COLUMN "phrase_key" text;--> statement-breakpoint
UPDATE "interest_aliases" SET "phrase_key" = lower(btrim("phrase", U&'\0009\000a\000b\000c\000d\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff'));--> statement-breakpoint
ALTER TABLE "interest_aliases" ALTER COLUMN "phrase_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "interest_aliases" DROP CONSTRAINT "interest_aliases_organisation_id_interest_id_phrase_pk";--> statement-breakpoint
ALTER TABLE "interest_aliases" ADD CONSTRAINT "interest_aliases_organisation_id_phrase_key_pk" PRIMARY KEY("organisation_id","phrase_key");
