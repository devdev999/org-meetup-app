ALTER TABLE "notices" ADD COLUMN "message_prefix" text;
--> statement-breakpoint
UPDATE "notices"
SET "message_prefix" = substring("message" from '^[^[:space:]]+ invited you to (?:a Meetup|an Event)[.]')
WHERE "kind" = 'invite-received';
