ALTER TYPE "public"."agent_turn_status" ADD VALUE 'queued';--> statement-breakpoint
ALTER TABLE "agent_turns" ADD COLUMN "prompt" text;