-- Custom SQL migration file, put your code below! --
INSERT INTO "public"."actors" ("id", "user_id") SELECT "id", "id" FROM "auth"."users";--> statement-breakpoint
CREATE FUNCTION "public"."actors_add_user"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO "public"."actors" ("id", "user_id") VALUES (NEW."id", NEW."id");
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "actors_add_user" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."actors_add_user"();--> statement-breakpoint
CREATE FUNCTION "public"."actors_add_agent"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO "public"."actors" ("id", "agent_id") VALUES (NEW."id", NEW."id");
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "actors_add_agent" AFTER INSERT ON "public"."agents" FOR EACH ROW EXECUTE FUNCTION "public"."actors_add_agent"();
