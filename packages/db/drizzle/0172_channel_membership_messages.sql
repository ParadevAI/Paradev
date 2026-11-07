CREATE TYPE "public"."channel_message_subtype" AS ENUM('channel_join', 'channel_leave');--> statement-breakpoint
ALTER TABLE "channel_messages" ADD COLUMN "subtype" "channel_message_subtype";--> statement-breakpoint
ALTER TABLE "channel_messages" ADD COLUMN "inviter_id" uuid;--> statement-breakpoint
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_inviter_id_actors_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;