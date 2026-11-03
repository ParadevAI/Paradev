CREATE TYPE "public"."channel_kind" AS ENUM('channel', 'dm');--> statement-breakpoint
DROP VIEW "authz"."melange_tuples";--> statement-breakpoint
ALTER TABLE "channel_members" RENAME COLUMN "user_id" TO "actor_id";--> statement-breakpoint
ALTER TABLE "channel_message_reactions" RENAME COLUMN "user_id" TO "actor_id";--> statement-breakpoint
ALTER TABLE "channel_messages" RENAME COLUMN "author_user_id" TO "author_id";--> statement-breakpoint
ALTER TABLE "channel_messages" RENAME COLUMN "mentioned_user_ids" TO "mentioned_ids";--> statement-breakpoint
ALTER TABLE "channel_thread_follows" RENAME COLUMN "user_id" TO "actor_id";--> statement-breakpoint
ALTER TABLE "channel_members" DROP CONSTRAINT "channel_members_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "channel_message_reactions" DROP CONSTRAINT "channel_message_reactions_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "channel_messages" DROP CONSTRAINT "channel_messages_author_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "channel_thread_follows" DROP CONSTRAINT "channel_thread_follows_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "channel_members_user_idx";--> statement-breakpoint
DROP INDEX "channel_thread_follows_user_idx";--> statement-breakpoint
DROP INDEX "channel_messages_author_client_unique";--> statement-breakpoint
DROP INDEX "channels_org_name_unique";--> statement-breakpoint
ALTER TABLE "channel_members" DROP CONSTRAINT "channel_members_channel_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "channel_message_reactions" DROP CONSTRAINT "channel_message_reactions_message_id_user_id_emoji_pk";--> statement-breakpoint
ALTER TABLE "channel_thread_follows" DROP CONSTRAINT "channel_thread_follows_root_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_channel_id_actor_id_pk" PRIMARY KEY("channel_id","actor_id");--> statement-breakpoint
ALTER TABLE "channel_message_reactions" ADD CONSTRAINT "channel_message_reactions_message_id_actor_id_emoji_pk" PRIMARY KEY("message_id","actor_id","emoji");--> statement-breakpoint
ALTER TABLE "channel_thread_follows" ADD CONSTRAINT "channel_thread_follows_root_id_actor_id_pk" PRIMARY KEY("root_id","actor_id");--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "kind" "channel_kind" DEFAULT 'channel' NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_message_reactions" ADD CONSTRAINT "channel_message_reactions_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_author_id_actors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_thread_follows" ADD CONSTRAINT "channel_thread_follows_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channel_members_actor_idx" ON "channel_members" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "channel_thread_follows_actor_idx" ON "channel_thread_follows" USING btree ("actor_id","channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_messages_author_client_unique" ON "channel_messages" USING btree ("author_id","client_id") WHERE "channel_messages"."client_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "channels_org_name_unique" ON "channels" USING btree ("organization_id",lower("name")) WHERE "channels"."archived_at" IS NULL AND "channels"."kind" = 'channel';--> statement-breakpoint
CREATE VIEW "authz"."melange_tuples" AS (
		select 'agent'::text as subject_type, a.id::text as subject_id, 'member'::text as relation,
			'organization'::text as object_type, a.organization_id::text as object_id
		from public.agents a where a.archived_at is null
		union all
		select 'agent', a.id::text, 'member', 'channel', m.channel_id::text
		from public.channel_members m
		join public.agents a on a.id = m.actor_id and a.archived_at is null
		union all
		select 'organization', c.organization_id::text, 'organization', 'channel', c.id::text
		from public.channels c where c.archived_at is null
	);