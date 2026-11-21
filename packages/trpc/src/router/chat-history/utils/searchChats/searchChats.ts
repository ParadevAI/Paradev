import { db, dbWs } from "@superset/db/client";
import { type SQL, sql } from "drizzle-orm";
import { splitSearchQuery } from "../searchText";

const BM25_INDEX = "chat_items_search_bm25";
const BM25_CHECK_MS = 10 * 60 * 1000;

let bm25: { available: boolean; checkedAt: number } | null = null;

async function bm25Available(now = Date.now()): Promise<boolean> {
	if (bm25 && now - bm25.checkedAt < BM25_CHECK_MS) return bm25.available;
	const { rows } = await db.execute<{ found: number }>(
		sql`select 1 as found from pg_indexes
			where indexname = ${BM25_INDEX} and tablename = 'chat_items'
				and schemaname = current_schema()
			limit 1`,
	);
	bm25 = { available: rows.length > 0, checkedAt: now };
	return bm25.available;
}

export type ChatSearchResult = {
	sessionId: string;
	itemId: string;
	kind: string;
	title: string | null;
	harness: string | null;
	harnessSessionId: string | null;
	workspaceId: string | null;
	lastActiveAt: Date;
	snippet: string;
	score: number;
};

type Row = Omit<ChatSearchResult, "lastActiveAt" | "score"> & {
	lastActiveAt: string | Date;
	score: number | string;
};

/** The best-matching item of each matching chat. */
function candidates(args: {
	query: string;
	userId: string;
	organizationId: string;
	useBm25: boolean;
}): SQL {
	const tsQuery = sql`websearch_to_tsquery('english', ${args.query})`;
	const score = args.useBm25
		? sql`-(i.search <@> to_bm25query(to_tsvector('english', ${args.query}), ${BM25_INDEX}))`
		: sql`ts_rank_cd(i.search, ${tsQuery})`;
	return sql`
		select distinct on (i.session_id)
			i.session_id, i.item_id, i.kind, i.search_text, ${score} as score
		from chat_items i
		where i.created_by = ${args.userId}
			and i.organization_id = ${args.organizationId}
			and i.search @@ ${tsQuery}
		order by i.session_id, score desc`;
}

/**
 * The best-matching item of each conversation. Copies of a chat that a
 * resume made share a harness session, so they count as one.
 */
export async function searchChats(args: {
	query: string;
	userId: string;
	organizationId: string;
	limit: number;
}): Promise<ChatSearchResult[]> {
	const query = splitSearchQuery(args.query);
	if (!query) return [];
	const statement = (useBm25: boolean) => sql`
		with hits as (${candidates({ ...args, query, useBm25 })}),
		ranked as (
			select h.*, s.title, s.harness, s.harness_session_id, s.v2_workspace_id,
				s.last_active_at,
				row_number() over (
					partition by coalesce(s.harness, ''), coalesce(s.harness_session_id, s.id::text)
					order by h.score desc, s.last_active_at desc
				) as rank
			from hits h join chat_sessions s on s.id = h.session_id
		)
		select session_id as "sessionId", item_id as "itemId", kind, title, harness,
			harness_session_id as "harnessSessionId", v2_workspace_id as "workspaceId",
			last_active_at as "lastActiveAt", score,
			ts_headline('english', chat_search_text(search_text), websearch_to_tsquery('english', ${query}),
				'MaxFragments=1, MaxWords=24, MinWords=8, StartSel=«, StopSel=»') as snippet
		from ranked
		where rank = 1
		order by score desc, last_active_at desc
		limit ${args.limit}`;

	let rows: Row[] | null = null;
	if (await bm25Available()) {
		try {
			rows = await dbWs.transaction(async (tx) => {
				await tx.execute(
					sql`select set_config('lakebase_bm25.prefilter', 'on', true)`,
				);
				return (await tx.execute<Row>(statement(true))).rows;
			});
		} catch (error) {
			console.warn("[chat-search] BM25 search failed; using full-text", error);
			bm25 = { available: false, checkedAt: Date.now() };
		}
	}
	rows ??= (await db.execute<Row>(statement(false))).rows;

	return rows.map((row) => ({
		...row,
		lastActiveAt: new Date(row.lastActiveAt),
		score: Number(row.score),
	}));
}
