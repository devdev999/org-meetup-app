ALTER TABLE "notice_deliveries" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notice_deliveries" ADD COLUMN "dead_lettered_at" timestamp with time zone;