ALTER TABLE "agent_turns" ADD COLUMN "attempts" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_turns" ADD COLUMN "last_attempt_error" text;