import {
	AcpEventMapper,
	type MappedOutput,
} from "@superset/agent-harness/events";
import type {
	Cursor,
	DeltaEnvelope,
	DurableEnvelope,
	DurableEvent,
	SessionState,
	Turn,
} from "@superset/chat/protocol";

export interface SqlCursor<T> {
	toArray(): T[];
}

export interface Sql {
	exec<T = Record<string, unknown>>(
		query: string,
		...bindings: unknown[]
	): SqlCursor<T>;
}

export type AcpUpdate = { sessionUpdate: string } & Record<string, unknown>;

/** One step's writes, appended at most once per `stepKey`. */
export interface AppendInput {
	stepKey: string;
	turnId: string;
	turnStart?: { startedAtMs: number };
	acp?: AcpUpdate[];
	transcript?: unknown[];
	turnEnd?: Turn;
}

export interface AppendResult {
	duplicate: boolean;
	envelopes: DurableEnvelope[];
	deltas: DeltaEnvelope[];
}

export interface TranscriptRow {
	seq: number;
	stepKey: string;
	entry: unknown;
}

export type EventsSince =
	| { reset: "epoch_changed" | "invalid_cursor" }
	| { envelopes: DurableEnvelope[]; more: boolean };

/** Newest first by page, oldest first within one, as chat-v3's `getItems` pages. */
export type EventsBefore =
	| { reset: "epoch_changed" | "invalid_cursor" }
	| { envelopes: DurableEnvelope[]; nextBefore: Cursor | null };

export interface SessionHead {
	cursor: Cursor | null;
	session: SessionState | null;
	updatedAt: number | null;
}

const HARNESS = "agent-harness";
const MAX_VALUE_CHARS = 1_500_000;

/**
 * The durable record of one agent session: the raw ACP updates, the chat-v3
 * events clients read (derived from those updates), and the pi transcript the
 * model reads. Writes come from one worker; every write is keyed by its step
 * so a retried activity never appends twice.
 */
export class AgentSessionLog {
	private ready = false;
	private mapper: { turnId: string; mapper: AcpEventMapper } | null = null;

	constructor(
		private readonly sql: Sql,
		private readonly transaction: (fn: () => void) => void,
		private readonly sessionId: string,
		private readonly now: () => number = Date.now,
	) {}

	epoch(): string {
		this.ensureSchema();
		const [row] = this.sql
			.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'epoch'")
			.toArray();
		if (row) return row.value;
		const epoch = crypto.randomUUID();
		this.sql.exec("INSERT INTO meta (key, value) VALUES ('epoch', ?)", epoch);
		return epoch;
	}

	append(input: AppendInput): AppendResult {
		this.ensureSchema();
		const [seen] = this.sql
			.exec("SELECT 1 FROM steps WHERE step_key = ?", input.stepKey)
			.toArray();
		if (seen) return { duplicate: true, envelopes: [], deltas: [] };

		const epoch = this.epoch();
		const ts = this.now();
		const envelopes: DurableEnvelope[] = [];
		const deltas: DeltaEnvelope[] = [];
		try {
			this.transaction(() => {
				this.sql.exec(
					"INSERT INTO steps (step_key, at) VALUES (?, ?)",
					input.stepKey,
					ts,
				);
				for (const entry of input.transcript ?? []) {
					this.sql.exec(
						"INSERT INTO transcript (step_key, entry) VALUES (?, ?)",
						input.stepKey,
						boundedJson(entry),
					);
				}
				const mapper = this.mapperFor(input.turnId);
				const outputs: MappedOutput[] = [];
				if (input.turnStart) {
					outputs.push(
						mapper.startTurn(input.turnId, input.turnStart.startedAtMs),
					);
				}
				for (const update of input.acp ?? []) {
					this.sql.exec(
						"INSERT INTO acp (turn_id, step_key, update_json) VALUES (?, ?, ?)",
						input.turnId,
						input.stepKey,
						boundedJson(update),
					);
					outputs.push(mapper.apply(update, input.turnId));
				}
				if (input.turnEnd) outputs.push(mapper.endTurn(input.turnEnd));

				for (const out of outputs) {
					for (const event of out.events) {
						const [row] = this.sql
							.exec<{ seq: number }>(
								"INSERT INTO events (epoch, ts, event_json) VALUES (?, ?, ?) RETURNING seq",
								epoch,
								ts,
								boundedJson(event),
							)
							.toArray();
						envelopes.push(
							this.envelope({ epoch, seq: row?.seq ?? 0 }, ts, event),
						);
					}
					for (const delta of out.deltas) {
						deltas.push({ v: 1, sessionId: this.sessionId, ts, delta });
					}
				}
			});
		} catch (error) {
			this.mapper = null;
			throw error;
		}
		if (input.turnEnd) this.mapper = null;
		return { duplicate: false, envelopes, deltas };
	}

	eventsSince(since: Cursor | null, limit = 500): EventsSince {
		const epoch = this.epoch();
		if (since && since.epoch !== epoch) return { reset: "epoch_changed" };
		const after = since?.seq ?? 0;
		const rows = this.sql
			.exec<{ seq: number; ts: number; event_json: string }>(
				"SELECT seq, ts, event_json FROM events WHERE epoch = ? AND seq > ? ORDER BY seq LIMIT ?",
				epoch,
				after,
				limit + 1,
			)
			.toArray();
		const more = rows.length > limit;
		return {
			more,
			envelopes: rows
				.slice(0, limit)
				.map((row) =>
					this.envelope(
						{ epoch, seq: row.seq },
						row.ts,
						JSON.parse(row.event_json) as DurableEvent,
					),
				),
		};
	}

	eventsBefore(before: Cursor | null, limit = 200): EventsBefore {
		const epoch = this.epoch();
		if (before && before.epoch !== epoch) return { reset: "epoch_changed" };
		const rows = this.sql
			.exec<{ seq: number; ts: number; event_json: string }>(
				"SELECT seq, ts, event_json FROM events WHERE epoch = ? AND seq < ? ORDER BY seq DESC LIMIT ?",
				epoch,
				before?.seq ?? Number.MAX_SAFE_INTEGER,
				limit + 1,
			)
			.toArray();
		const page = rows.slice(0, limit).reverse();
		const oldest = page[0];
		return {
			envelopes: page.map((row) =>
				this.envelope(
					{ epoch, seq: row.seq },
					row.ts,
					JSON.parse(row.event_json) as DurableEvent,
				),
			),
			nextBefore:
				rows.length > limit && oldest ? { epoch, seq: oldest.seq } : null,
		};
	}

	head(): SessionHead {
		const epoch = this.epoch();
		const [last] = this.sql
			.exec<{ seq: number; ts: number }>(
				"SELECT seq, ts FROM events WHERE epoch = ? ORDER BY seq DESC LIMIT 1",
				epoch,
			)
			.toArray();
		const [state] = this.sql
			.exec<{ event_json: string }>(
				`SELECT event_json FROM events WHERE epoch = ? AND event_json LIKE '{"type":"session"%' ORDER BY seq DESC LIMIT 1`,
				epoch,
			)
			.toArray();
		return {
			cursor: last ? { epoch, seq: last.seq } : null,
			session: state
				? (JSON.parse(state.event_json) as { session: SessionState }).session
				: null,
			updatedAt: last?.ts ?? null,
		};
	}

	transcript(
		query: { afterSeq?: number; stepKey?: string; limit?: number } = {},
	): TranscriptRow[] {
		this.ensureSchema();
		const rows = query.stepKey
			? this.sql
					.exec<{ seq: number; step_key: string; entry: string }>(
						"SELECT seq, step_key, entry FROM transcript WHERE step_key = ? ORDER BY seq",
						query.stepKey,
					)
					.toArray()
			: this.sql
					.exec<{ seq: number; step_key: string; entry: string }>(
						"SELECT seq, step_key, entry FROM transcript WHERE seq > ? ORDER BY seq LIMIT ?",
						query.afterSeq ?? 0,
						query.limit ?? 1_000,
					)
					.toArray();
		return rows.map((row) => ({
			seq: row.seq,
			stepKey: row.step_key,
			entry: JSON.parse(row.entry),
		}));
	}

	private envelope(
		cursor: Cursor,
		ts: number,
		event: DurableEvent,
	): DurableEnvelope {
		return { v: 1, sessionId: this.sessionId, ts, cursor, event };
	}

	private mapperFor(turnId: string): AcpEventMapper {
		if (this.mapper?.turnId === turnId) return this.mapper.mapper;
		const mapper = new AcpEventMapper({ harness: HARNESS, now: this.now });
		const rows = this.sql
			.exec<{ update_json: string }>(
				"SELECT update_json FROM acp WHERE turn_id = ? ORDER BY seq",
				turnId,
			)
			.toArray();
		for (const row of rows)
			mapper.apply(JSON.parse(row.update_json) as AcpUpdate, turnId);
		this.mapper = { turnId, mapper };
		return mapper;
	}

	private ensureSchema(): void {
		if (this.ready) return;
		this.sql.exec(
			"CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
		);
		this.sql.exec(
			"CREATE TABLE IF NOT EXISTS steps (step_key TEXT PRIMARY KEY, at INTEGER NOT NULL)",
		);
		this.sql.exec(
			"CREATE TABLE IF NOT EXISTS acp (seq INTEGER PRIMARY KEY AUTOINCREMENT, turn_id TEXT NOT NULL, step_key TEXT NOT NULL, update_json TEXT NOT NULL)",
		);
		this.sql.exec("CREATE INDEX IF NOT EXISTS acp_turn ON acp (turn_id, seq)");
		this.sql.exec(
			"CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, epoch TEXT NOT NULL, ts INTEGER NOT NULL, event_json TEXT NOT NULL)",
		);
		this.sql.exec(
			"CREATE TABLE IF NOT EXISTS transcript (seq INTEGER PRIMARY KEY AUTOINCREMENT, step_key TEXT NOT NULL, entry TEXT NOT NULL)",
		);
		this.ready = true;
	}
}

function boundedJson(value: unknown): string {
	const json = JSON.stringify(value);
	if (json.length <= MAX_VALUE_CHARS) return json;
	const record = value as Record<string, unknown>;
	return JSON.stringify({
		...("sessionUpdate" in record
			? { sessionUpdate: record.sessionUpdate }
			: {}),
		...("toolCallId" in record ? { toolCallId: record.toolCallId } : {}),
		...("status" in record ? { status: record.status } : {}),
		truncated: true,
	});
}
