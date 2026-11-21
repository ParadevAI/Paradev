DROP INDEX "agent_sessions_active_task_dedupe_unique";--> statement-breakpoint
ALTER TABLE "agent_sessions" DROP COLUMN "title";--> statement-breakpoint
ALTER TABLE "agent_sessions" DROP COLUMN "dedupe_key";--> statement-breakpoint
ALTER TABLE "agent_sessions" DROP COLUMN "result";--> statement-breakpoint
ALTER TABLE "agent_sessions" DROP COLUMN "pull_request_url";