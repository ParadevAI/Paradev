import { channelMessages } from "@superset/db/schema";
import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

/** The preview a list row shows of a channel's newest post; longer bodies are cut here, not on the client. */
export const PREVIEW_CHARS = 200;

/**
 * One column of the channel's newest top-level post that still reads as a
 * message: not deleted, and not a join or leave line. `column` is written
 * against the alias `m`.
 */
export function latestPostSql<T>(
	channelId: SQLWrapper,
	column: SQL,
): SQL<T | null> {
	return sql<T | null>`(
		select ${column} from ${channelMessages} m
		where m.channel_id = ${channelId}
			and m.thread_root_id is null
			and m.deleted_at is null
			and m.subtype is null
		order by m.seq desc
		limit 1
	)`;
}

export const latestPostBodySql = (channelId: SQLWrapper) =>
	latestPostSql<string>(channelId, sql`left(m.body, ${PREVIEW_CHARS})`);

export const latestPostAuthorIdSql = (channelId: SQLWrapper) =>
	latestPostSql<string>(channelId, sql`m.author_id`);
