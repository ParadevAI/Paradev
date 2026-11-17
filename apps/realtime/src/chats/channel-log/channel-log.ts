/** The slice of a Durable Object's SQLite the log needs, so tests can stand in a plain database. */
export interface Sql {
	exec(
		query: string,
		...params: (string | number)[]
	): Record<string, unknown>[];
}

/** How much a channel keeps for clients resuming after a drop: the last 100 events, none older than a day. */
export const HISTORY_LIMIT = 100;
export const HISTORY_MAX_AGE_MS = 24 * 60 * 60_000;

/**
 * What a channel sends: `hello` first on every connection (the channel's latest seq, and whether everything since the
 * client's `since` follows), then `event`s with increasing seqs.
 */
export type Frame =
	| { type: "hello"; channel: string; seq: number; resumed: boolean }
	| {
			type: "event";
			channel: string;
			seq: number;
			data: unknown;
			ephemeral?: true;
	  };

export function migrate(sql: Sql) {
	sql.exec(
		"CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, at INTEGER NOT NULL, data TEXT NOT NULL)",
	);
	// The latest seq outlives trimmed events, so a client that saw it can still resume with nothing missed.
	sql.exec(
		"CREATE TABLE IF NOT EXISTS head (id INTEGER PRIMARY KEY CHECK (id = 1), seq INTEGER NOT NULL)",
	);
}

const headSeq = (sql: Sql) =>
	(sql.exec("SELECT seq FROM head WHERE id = 1")[0]?.seq as
		| number
		| undefined) ?? 0;

function trim(sql: Sql, now: number) {
	sql.exec(
		"DELETE FROM events WHERE seq <= ? OR at < ?",
		headSeq(sql) - HISTORY_LIMIT,
		now - HISTORY_MAX_AGE_MS,
	);
}

/** Stores an event under the next seq and returns the frame to broadcast. `data` is the API's JSON text, kept as is. */
export function append(
	sql: Sql,
	channel: string,
	data: string,
	now: number,
): Frame & { type: "event" } {
	const seq = headSeq(sql) + 1;
	sql.exec(
		"INSERT INTO head (id, seq) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET seq = excluded.seq",
		seq,
	);
	sql.exec(
		"INSERT INTO events (seq, at, data) VALUES (?, ?, ?)",
		seq,
		now,
		data,
	);
	trim(sql, now);
	return { type: "event", channel, seq, data: JSON.parse(data) };
}

/**
 * A frame for live sockets only (someone typing): never stored or replayed, and the seq doesn't move. It carries the
 * latest seq, so a client from before ephemeral frames drops it as a repeat rather than taking it as a gap.
 */
export function ephemeral(
	sql: Sql,
	channel: string,
	data: string,
): Frame & { type: "event" } {
	return {
		type: "event",
		channel,
		seq: headSeq(sql),
		data: JSON.parse(data),
		ephemeral: true,
	};
}

/**
 * The frames a (re)connecting client gets before live events. Without `since` it starts fresh. With one it gets every
 * event after it, if the channel still has them all; if not (too old, or a channel that lost its history) `resumed`
 * is false and the client re-bootstraps instead, as it did on every reconnect before seqs existed.
 */
export function resume(
	sql: Sql,
	channel: string,
	since: number | null,
	now: number,
): Frame[] {
	trim(sql, now);
	const seq = headSeq(sql);
	const hello = (resumed: boolean): Frame => ({
		type: "hello",
		channel,
		seq,
		resumed,
	});
	if (since === null || since > seq) return [hello(false)];
	const rows = sql.exec(
		"SELECT seq, data FROM events WHERE seq > ? ORDER BY seq",
		since,
	);
	const complete =
		rows.length === seq - since &&
		(rows.length === 0 || rows[0]?.seq === since + 1);
	if (!complete) return [hello(false)];
	return [
		hello(true),
		...rows.map(
			(r): Frame => ({
				type: "event",
				channel,
				seq: r.seq as number,
				data: JSON.parse(r.data as string),
			}),
		),
	];
}
