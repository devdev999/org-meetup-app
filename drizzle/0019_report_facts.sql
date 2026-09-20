ALTER TABLE "gatherings" ADD COLUMN "had_waitlist" boolean;
--> statement-breakpoint
UPDATE "gatherings" SET "had_waitlist" = true
WHERE EXISTS (SELECT 1 FROM "gathering_members" WHERE "gathering_members"."organisation_id" = "gatherings"."organisation_id"
  AND "gathering_members"."gathering_id" = "gatherings"."id" AND "gathering_members"."status" = 'waitlisted');
--> statement-breakpoint
ALTER TABLE "gatherings" ALTER COLUMN "had_waitlist" SET DEFAULT false;
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "has_declared_interest" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "first_interest_declared_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "members" SET "has_declared_interest" = true
WHERE EXISTS (SELECT 1 FROM "member_interests" WHERE "member_interests"."organisation_id" = "members"."organisation_id"
  AND "member_interests"."member_id" = "members"."id");
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "last_activity_at" timestamp with time zone;
