import { sql } from "drizzle-orm";
import { type AnyPgColumn, check, pgTable, uuid } from "drizzle-orm/pg-core";
import { agents } from "./agents";
import { users } from "./auth";

/**
 * Anyone who can be in a channel, write in it, or be mentioned: a person or a
 * Dev. A person's actor id is their user id and a Dev's is its agent id, so a
 * session's user id is already the caller's actor id. Triggers add the row
 * when a user or agent is created; deleting either deletes it.
 */
export const actors = pgTable(
	"actors",
	{
		id: uuid().primaryKey(),
		userId: uuid("user_id")
			.unique()
			.references(() => users.id, { onDelete: "cascade" }),
		agentId: uuid("agent_id")
			.unique()
			.references((): AnyPgColumn => agents.id, { onDelete: "cascade" }),
	},
	(t) => [
		check(
			"actors_one_kind",
			sql`(${t.userId} IS NULL) <> (${t.agentId} IS NULL)`,
		),
		check(
			"actors_id_matches",
			sql`${t.id} = coalesce(${t.userId}, ${t.agentId})`,
		),
	],
);

export type SelectActor = typeof actors.$inferSelect;
