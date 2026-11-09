import type { SqlLike, SqlValue } from "../page-storage-records";
import {
	CHAT_MOVE_IN_FLIGHT,
	type ChatMove,
	type ChatMoveStatus,
	MOVE_STOPPED_ANSWERING,
	type MoveBookOp,
	type MoveBookRefusal,
	type MoveBookRefusalCode,
	type MoveBookReplyFor,
	type MoveBookRequest,
	type MoveBookResponse,
	type MoveChatCounts,
	type NewChatMove,
	STALE_MOVE_MS,
	WORKSPACE_MOVE_IN_FLIGHT,
	type WorkspaceMove,
	type WorkspaceMoveStatus,
} from "./protocol";

type Row = Record<string, SqlValue>;

type WorkspaceMoveRow = {
	id: string;
	created_by: string;
	from_workspace_id: string;
	from_host_id: string | null;
	to_workspace_id: string | null;
	to_host_id: string | null;
	branch: string | null;
	status: string;
	error: string | null;
	created_at: number;
	updated_at: number;
	finished_at: number | null;
};

type ChatMoveRow = {
	id: string;
	workspace_move_id: string;
	session_id: string;
	created_by: string;
	from_workspace_id: string | null;
	from_host_id: string | null;
	to_workspace_id: string;
	to_host_id: string | null;
	source_turn_seq: number | null;
	transcript_id: string;
	harness_session_id: string;
	status: string;
	error: string | null;
	created_at: number;
	updated_at: number;
	finished_at: number | null;
};

const CHAT_IN_FLIGHT_SQL = inList(CHAT_MOVE_IN_FLIGHT);
const WORKSPACE_IN_FLIGHT_SQL = inList(WORKSPACE_MOVE_IN_FLIGHT);

function inList(values: readonly string[]): string {
	return `(${values.map((value) => `'${value}'`).join(", ")})`;
}

class Refused extends Error {
	constructor(
		readonly code: MoveBookRefusalCode,
		message: string,
	) {
		super(message);
	}
}

/**
 * An organization's workspace moves and chat moves. Every request first fails
 * the moves that stopped answering, then runs in one transaction, so two
 * requests never see each other half done.
 */
export class MoveBook {
	private ready = false;

	constructor(
		private readonly sql: SqlLike,
		private readonly transaction: (fn: () => void) => void,
		private readonly organizationId: string,
		private readonly now: () => number = Date.now,
		private readonly newId: () => string = () => crypto.randomUUID(),
	) {}

	apply(request: MoveBookRequest): MoveBookResponse {
		this.ensureSchema();
		let response: MoveBookResponse = refusal("invalid", "Unknown move op");
		try {
			this.transaction(() => {
				const now = this.now();
				this.failStale(now);
				response = this.run(request, now);
			});
		} catch (error) {
			if (error instanceof Refused) return refusal(error.code, error.message);
			throw error;
		}
		return response;
	}

	/** Fails the moves that stopped answering; run from the hub's alarm. */
	sweep(): void {
		this.ensureSchema();
		this.transaction(() => this.failStale(this.now()));
	}

	/** When the oldest move still in flight goes stale, or null when none is. */
	nextStaleAt(): number | null {
		this.ensureSchema();
		const [row] = this.rows<{ oldest: number | null }>(
			`SELECT min(oldest) AS oldest FROM (
				SELECT min(updated_at) AS oldest FROM workspace_moves WHERE status IN ${WORKSPACE_IN_FLIGHT_SQL}
				UNION ALL
				SELECT min(updated_at) AS oldest FROM chat_moves
				WHERE status IN ${CHAT_IN_FLIGHT_SQL} AND status != 'pending'
				UNION ALL
				SELECT min(max(chat.updated_at, parent.updated_at)) AS oldest
				FROM chat_moves chat JOIN workspace_moves parent ON parent.id = chat.workspace_move_id
				WHERE chat.status = 'pending'
			)`,
		);
		return row?.oldest == null ? null : row.oldest + STALE_MOVE_MS;
	}

	private run(request: MoveBookRequest, now: number): MoveBookResponse {
		switch (request.op) {
			case "begin":
				return reply("begin", { move: this.begin(request, now) });
			case "attach":
				return reply("attach", { moves: this.attach(request, now) });
			case "abandon":
				this.exec(
					`UPDATE workspace_moves SET status = 'failed', error = ?, finished_at = ?, updated_at = ?
					WHERE id = ? AND status = 'pending' AND to_workspace_id IS NULL`,
					request.error,
					now,
					now,
					request.workspaceMoveId,
				);
				return reply("abandon", {});
			case "retry":
				return reply("retry", { move: this.retry(request, now) });
			case "workspaceMove":
				return reply("workspaceMove", {
					move: this.workspaceMove(request.id),
				});
			case "chatMove":
				return reply("chatMove", { move: this.chatMove(request.id) });
			case "latestWorkspaceMove":
				return reply("latestWorkspaceMove", this.latestWorkspaceMove(request));
			case "latestChatMove": {
				const [row] = this.rows<ChatMoveRow>(
					`SELECT * FROM chat_moves WHERE session_id = ? AND created_by = ?
					ORDER BY created_at DESC, rowid DESC LIMIT 1`,
					request.sessionId,
					request.createdBy,
				);
				return reply("latestChatMove", {
					move: row ? this.toChatMove(row) : null,
				});
			}
			case "chatMoving": {
				const [row] = request.freshInto
					? this.rows<{ id: string }>(
							`SELECT id FROM chat_moves WHERE session_id = ? AND status IN ${CHAT_IN_FLIGHT_SQL}
							AND to_workspace_id = ? AND updated_at > ? LIMIT 1`,
							request.sessionId,
							request.freshInto,
							now - STALE_MOVE_MS,
						)
					: this.rows<{ id: string }>(
							`SELECT id FROM chat_moves WHERE session_id = ? AND status IN ${CHAT_IN_FLIGHT_SQL} LIMIT 1`,
							request.sessionId,
						);
				return reply("chatMoving", { moving: !!row });
			}
			case "claim": {
				const [row] = this.rows<ChatMoveRow>(
					`UPDATE chat_moves SET status = 'copying', updated_at = ?
					WHERE id = ? AND status = 'pending' RETURNING *`,
					now,
					request.id,
				);
				if (row) this.settle(row.workspace_move_id, now);
				return reply("claim", { move: row ? this.toChatMove(row) : null });
			}
			case "touchWorkspaceMove": {
				const [row] = this.rows<{ id: string }>(
					`UPDATE workspace_moves SET updated_at = ?
					WHERE id = ? AND status IN ${WORKSPACE_IN_FLIGHT_SQL} RETURNING id`,
					now,
					request.id,
				);
				return reply("touchWorkspaceMove", { alive: !!row });
			}
			case "touchChatMove": {
				const [row] = this.rows<{ workspace_move_id: string }>(
					`UPDATE chat_moves SET updated_at = ?
					WHERE id = ? AND status IN ('copying', 'restoring') RETURNING workspace_move_id`,
					now,
					request.id,
				);
				if (row) {
					this.exec(
						`UPDATE workspace_moves SET updated_at = ? WHERE id = ? AND status IN ${WORKSPACE_IN_FLIGHT_SQL}`,
						now,
						row.workspace_move_id,
					);
				}
				return reply("touchChatMove", { alive: !!row });
			}
			case "finish": {
				const [row] = this.rows<{ workspace_move_id: string }>(
					`UPDATE chat_moves SET status = 'ready', finished_at = ?, updated_at = ?
					WHERE id = ? AND status IN ('copying', 'restoring') RETURNING workspace_move_id`,
					now,
					now,
					request.id,
				);
				if (row) this.settle(row.workspace_move_id, now);
				return reply("finish", { finished: !!row });
			}
			case "fail": {
				const statuses = request.evenIfReady
					? inList([...CHAT_MOVE_IN_FLIGHT, "ready"])
					: CHAT_IN_FLIGHT_SQL;
				const [row] = this.rows<{ workspace_move_id: string }>(
					`UPDATE chat_moves SET status = 'failed', error = ?, finished_at = ?, updated_at = ?
					WHERE id = ? AND status IN ${statuses} RETURNING workspace_move_id`,
					request.error,
					now,
					now,
					request.id,
				);
				if (row) this.settle(row.workspace_move_id, now);
				return reply("fail", {});
			}
			case "pendingInto":
				return reply("pendingInto", {
					ids: this.rows<{ id: string }>(
						`SELECT id FROM chat_moves WHERE to_workspace_id = ? AND status = 'pending'
						ORDER BY created_at, rowid`,
						request.toWorkspaceId,
					).map((row) => row.id),
				});
			case "finishInto":
				for (const id of this.openInto(request.toWorkspaceId)) {
					this.end(id, now);
				}
				return reply("finishInto", {});
			case "failInto":
				this.exec(
					`UPDATE chat_moves SET status = 'failed', error = ?, finished_at = ?, updated_at = ?
					WHERE to_workspace_id = ? AND status IN ${CHAT_IN_FLIGHT_SQL}`,
					request.error,
					now,
					now,
					request.toWorkspaceId,
				);
				for (const id of this.openInto(request.toWorkspaceId)) {
					this.end(id, now, request.error);
				}
				return reply("failInto", {});
			default:
				return refusal("invalid", "Unknown move op");
		}
	}

	private begin(
		request: Extract<MoveBookRequest, { op: "begin" }>,
		now: number,
	): WorkspaceMove {
		const [moving] = this.rows<{ id: string }>(
			`SELECT id FROM workspace_moves WHERE from_workspace_id = ? AND status IN ${WORKSPACE_IN_FLIGHT_SQL} LIMIT 1`,
			request.fromWorkspaceId,
		);
		if (moving)
			throw new Refused("conflict", "This workspace is already moving");
		const [row] = this.rows<WorkspaceMoveRow>(
			`INSERT INTO workspace_moves (id, created_by, from_workspace_id, from_host_id, to_host_id, status, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, 'pending', ?, ?) RETURNING *`,
			this.newId(),
			request.createdBy,
			request.fromWorkspaceId,
			request.fromHostId,
			request.toHostId,
			now,
			now,
		);
		return this.toWorkspaceMove(row as WorkspaceMoveRow);
	}

	private attach(
		request: Extract<MoveBookRequest, { op: "attach" }>,
		now: number,
	): ChatMove[] {
		const parent = this.workspaceMove(request.workspaceMoveId);
		if (!parent) throw new Refused("not_found", "Move not found");
		if (parent.status !== "pending" || parent.toWorkspaceId !== null) {
			throw new Refused(
				"precondition",
				"This move already has its destination",
			);
		}
		for (const chat of request.chats) {
			if (this.isChatMoving(chat.sessionId)) {
				throw new Refused("conflict", "One of these chats is already moving");
			}
		}
		this.exec(
			`UPDATE workspace_moves SET to_workspace_id = ?, branch = ?, status = ?, updated_at = ? WHERE id = ?`,
			request.toWorkspaceId,
			request.branch,
			request.chats.length > 0 ? "moving" : "pending",
			now,
			parent.id,
		);
		return request.chats.map((chat) =>
			this.insertChatMove(parent.id, chat, now),
		);
	}

	private retry(
		request: Extract<MoveBookRequest, { op: "retry" }>,
		now: number,
	): ChatMove {
		const parent = this.workspaceMove(request.workspaceMoveId);
		if (!parent) throw new Refused("not_found", "Move not found");
		const [newer] = this.rows<{ id: string }>(
			`SELECT id FROM workspace_moves WHERE from_workspace_id = ? AND status IN ${WORKSPACE_IN_FLIGHT_SQL}
			AND id != ? LIMIT 1`,
			parent.fromWorkspaceId,
			parent.id,
		);
		if (newer) throw new Refused("conflict", "This workspace is moving again");
		if (this.isChatMoving(request.chat.sessionId)) {
			throw new Refused(
				"conflict",
				"This chat or its workspace is already moving",
			);
		}
		const move = this.insertChatMove(parent.id, request.chat, now);
		this.settle(parent.id, now);
		return move;
	}

	private latestWorkspaceMove(request: {
		workspaceId: string;
		createdBy: string;
	}): { move: WorkspaceMove | null; chats: MoveChatCounts } {
		const [row] = this.rows<WorkspaceMoveRow>(
			`SELECT * FROM workspace_moves
			WHERE (from_workspace_id = ? OR to_workspace_id = ?) AND created_by = ?
			ORDER BY created_at DESC, rowid DESC LIMIT 1`,
			request.workspaceId,
			request.workspaceId,
			request.createdBy,
		);
		if (!row) return { move: null, chats: { total: 0, ready: 0, failed: 0 } };
		const statuses = this.newestAttempts(row.id).map((chat) => chat.status);
		return {
			move: this.toWorkspaceMove(row),
			chats: {
				total: statuses.length,
				ready: statuses.filter((status) => status === "ready").length,
				failed: statuses.filter((status) => status === "failed").length,
			},
		};
	}

	/**
	 * Fails the moves that stopped changing state. A chat still waiting its
	 * turn counts as stopped only once its whole workspace move has, since the
	 * chats of a move to a computer run one after another. A workspace move
	 * that never got going fails with its quiet chats.
	 */
	private failStale(now: number): void {
		const stale = now - STALE_MOVE_MS;
		const quiet = this.rows<{ id: string }>(
			`SELECT id FROM workspace_moves WHERE status IN ${WORKSPACE_IN_FLIGHT_SQL} AND updated_at < ?`,
			stale,
		);
		for (const { id } of quiet) {
			this.exec(
				`UPDATE chat_moves SET status = 'failed', error = ?, finished_at = ?, updated_at = ?
				WHERE workspace_move_id = ? AND status IN ${CHAT_IN_FLIGHT_SQL} AND updated_at < ?`,
				MOVE_STOPPED_ANSWERING,
				now,
				now,
				id,
				stale,
			);
			this.end(id, now, MOVE_STOPPED_ANSWERING);
		}
		const failed = this.rows<{ workspace_move_id: string }>(
			`UPDATE chat_moves SET status = 'failed', error = ?, finished_at = ?, updated_at = ?
			WHERE status IN ${CHAT_IN_FLIGHT_SQL} AND updated_at < ?
			AND (status != 'pending' OR workspace_move_id IN (
				SELECT id FROM workspace_moves WHERE updated_at < ?
			))
			RETURNING workspace_move_id`,
			MOVE_STOPPED_ANSWERING,
			now,
			now,
			stale,
			stale,
		);
		for (const id of new Set(failed.map((row) => row.workspace_move_id))) {
			this.settle(id, now);
		}
	}

	/**
	 * Brings a workspace move's status in line with its chats, each counted by
	 * its newest attempt: `moving` while any is still moving, then `ready`,
	 * `failed` (with the first chat's error), or `partial` for a mix. A move
	 * with no chats is left to whoever starts its destination.
	 */
	private settle(workspaceMoveId: string, now: number): void {
		const newest = this.newestAttempts(workspaceMoveId);
		if (newest.length === 0) return;
		const inFlight = CHAT_MOVE_IN_FLIGHT as readonly string[];
		const moving = newest.filter((chat) => inFlight.includes(chat.status));
		const ready = newest.filter((chat) => chat.status === "ready");
		const failed = newest.filter((chat) => chat.status === "failed");
		const status: WorkspaceMoveStatus =
			moving.length > 0
				? "moving"
				: ready.length === newest.length
					? "ready"
					: failed.length === newest.length
						? "failed"
						: "partial";
		this.exec(
			`UPDATE workspace_moves SET status = ?, error = ?, finished_at = ?, updated_at = ? WHERE id = ?`,
			status,
			status === "failed" ? (failed[0]?.error ?? null) : null,
			moving.length > 0 ? null : now,
			now,
			workspaceMoveId,
		);
	}

	/** Settles a move from its chats; one without chats is `ready`, or failed with `error`. */
	private end(workspaceMoveId: string, now: number, error?: string): void {
		const [chat] = this.rows<{ id: string }>(
			"SELECT id FROM chat_moves WHERE workspace_move_id = ? LIMIT 1",
			workspaceMoveId,
		);
		if (chat) {
			this.settle(workspaceMoveId, now);
			return;
		}
		this.exec(
			`UPDATE workspace_moves SET status = ?, error = ?, finished_at = ?, updated_at = ?
			WHERE id = ? AND status IN ${WORKSPACE_IN_FLIGHT_SQL}`,
			error ? "failed" : "ready",
			error ?? null,
			now,
			now,
			workspaceMoveId,
		);
	}

	private newestAttempts(
		workspaceMoveId: string,
	): { status: string; error: string | null }[] {
		const rows = this.rows<{
			session_id: string;
			status: string;
			error: string | null;
		}>(
			`SELECT session_id, status, error FROM chat_moves WHERE workspace_move_id = ?
			ORDER BY created_at DESC, rowid DESC`,
			workspaceMoveId,
		);
		const newest = new Map<string, { status: string; error: string | null }>();
		for (const row of rows) {
			if (!newest.has(row.session_id)) newest.set(row.session_id, row);
		}
		return [...newest.values()];
	}

	private openInto(toWorkspaceId: string): string[] {
		return this.rows<{ id: string }>(
			`SELECT id FROM workspace_moves WHERE to_workspace_id = ? AND status IN ${WORKSPACE_IN_FLIGHT_SQL}`,
			toWorkspaceId,
		).map((row) => row.id);
	}

	private isChatMoving(sessionId: string): boolean {
		const [row] = this.rows<{ id: string }>(
			`SELECT id FROM chat_moves WHERE session_id = ? AND status IN ${CHAT_IN_FLIGHT_SQL} LIMIT 1`,
			sessionId,
		);
		return !!row;
	}

	private insertChatMove(
		workspaceMoveId: string,
		chat: NewChatMove,
		now: number,
	): ChatMove {
		const [row] = this.rows<ChatMoveRow>(
			`INSERT INTO chat_moves (id, workspace_move_id, session_id, created_by, from_workspace_id, from_host_id,
				to_workspace_id, to_host_id, source_turn_seq, transcript_id, harness_session_id, status, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?) RETURNING *`,
			this.newId(),
			workspaceMoveId,
			chat.sessionId,
			chat.createdBy,
			chat.fromWorkspaceId,
			chat.fromHostId,
			chat.toWorkspaceId,
			chat.toHostId,
			chat.sourceTurnSeq,
			chat.transcriptId,
			chat.harnessSessionId,
			now,
			now,
		);
		return this.toChatMove(row as ChatMoveRow);
	}

	private workspaceMove(id: string): WorkspaceMove | null {
		const [row] = this.rows<WorkspaceMoveRow>(
			"SELECT * FROM workspace_moves WHERE id = ?",
			id,
		);
		return row ? this.toWorkspaceMove(row) : null;
	}

	private chatMove(id: string): ChatMove | null {
		const [row] = this.rows<ChatMoveRow>(
			"SELECT * FROM chat_moves WHERE id = ?",
			id,
		);
		return row ? this.toChatMove(row) : null;
	}

	private toWorkspaceMove(row: WorkspaceMoveRow): WorkspaceMove {
		return {
			id: row.id,
			organizationId: this.organizationId,
			createdBy: row.created_by,
			fromWorkspaceId: row.from_workspace_id,
			fromHostId: row.from_host_id,
			toWorkspaceId: row.to_workspace_id,
			toHostId: row.to_host_id,
			branch: row.branch,
			status: row.status as WorkspaceMoveStatus,
			error: row.error,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
			finishedAt: row.finished_at,
		};
	}

	private toChatMove(row: ChatMoveRow): ChatMove {
		return {
			id: row.id,
			workspaceMoveId: row.workspace_move_id,
			sessionId: row.session_id,
			organizationId: this.organizationId,
			createdBy: row.created_by,
			fromWorkspaceId: row.from_workspace_id,
			fromHostId: row.from_host_id,
			toWorkspaceId: row.to_workspace_id,
			toHostId: row.to_host_id,
			sourceTurnSeq: row.source_turn_seq,
			transcriptId: row.transcript_id,
			harnessSessionId: row.harness_session_id,
			status: row.status as ChatMoveStatus,
			error: row.error,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
			finishedAt: row.finished_at,
		};
	}

	private rows<T>(query: string, ...bindings: unknown[]): T[] {
		return this.sql.exec<Row>(query, ...bindings).toArray() as T[];
	}

	private exec(query: string, ...bindings: unknown[]): void {
		this.sql.exec(query, ...bindings).toArray();
	}

	private ensureSchema(): void {
		if (this.ready) return;
		this.sql.exec(
			`CREATE TABLE IF NOT EXISTS workspace_moves (
				id TEXT PRIMARY KEY,
				created_by TEXT NOT NULL,
				from_workspace_id TEXT NOT NULL,
				from_host_id TEXT,
				to_workspace_id TEXT,
				to_host_id TEXT,
				branch TEXT,
				status TEXT NOT NULL,
				error TEXT,
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL,
				finished_at INTEGER
			)`,
		);
		this.sql.exec(
			"CREATE INDEX IF NOT EXISTS workspace_moves_from_idx ON workspace_moves (from_workspace_id, created_at)",
		);
		this.sql.exec(
			"CREATE INDEX IF NOT EXISTS workspace_moves_to_idx ON workspace_moves (to_workspace_id)",
		);
		this.sql.exec(
			`CREATE UNIQUE INDEX IF NOT EXISTS workspace_moves_one_in_flight_idx ON workspace_moves (from_workspace_id)
			WHERE status IN ${WORKSPACE_IN_FLIGHT_SQL}`,
		);
		this.sql.exec(
			`CREATE TABLE IF NOT EXISTS chat_moves (
				id TEXT PRIMARY KEY,
				workspace_move_id TEXT NOT NULL REFERENCES workspace_moves (id) ON DELETE CASCADE,
				session_id TEXT NOT NULL,
				created_by TEXT NOT NULL,
				from_workspace_id TEXT,
				from_host_id TEXT,
				to_workspace_id TEXT NOT NULL,
				to_host_id TEXT,
				source_turn_seq INTEGER,
				transcript_id TEXT NOT NULL,
				harness_session_id TEXT NOT NULL,
				status TEXT NOT NULL,
				error TEXT,
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL,
				finished_at INTEGER
			)`,
		);
		this.sql.exec(
			"CREATE INDEX IF NOT EXISTS chat_moves_session_idx ON chat_moves (session_id, created_at)",
		);
		this.sql.exec(
			"CREATE INDEX IF NOT EXISTS chat_moves_to_idx ON chat_moves (to_workspace_id)",
		);
		this.sql.exec(
			"CREATE INDEX IF NOT EXISTS chat_moves_workspace_move_idx ON chat_moves (workspace_move_id)",
		);
		this.sql.exec(
			`CREATE UNIQUE INDEX IF NOT EXISTS chat_moves_one_in_flight_idx ON chat_moves (session_id)
			WHERE status IN ${CHAT_IN_FLIGHT_SQL}`,
		);
		this.ready = true;
	}
}

function reply<Op extends MoveBookOp>(
	_op: Op,
	body: Omit<MoveBookReplyFor<Op>, "ok">,
): MoveBookResponse {
	return { ok: true, ...body } as MoveBookResponse;
}

function refusal(code: MoveBookRefusalCode, message: string): MoveBookRefusal {
	return { ok: false, code, message };
}
