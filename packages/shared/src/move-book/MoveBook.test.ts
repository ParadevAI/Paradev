import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import type { SqlLike } from "../page-storage-records";
import { MoveBook } from "./MoveBook";
import {
	type MoveBookOp,
	type MoveBookReplyFor,
	type MoveBookRequest,
	type NewChatMove,
	STALE_MOVE_MS,
} from "./protocol";

function newBook() {
	const db = new Database(":memory:");
	const sql: SqlLike = {
		exec(query, ...bindings) {
			const rows = db.query(query).all(...(bindings as never[]));
			return { toArray: () => rows as never[] };
		},
	};
	const clock = { now: 1_000_000 };
	let ids = 0;
	const book = new MoveBook(
		sql,
		(fn) => db.transaction(fn)(),
		"org-1",
		() => clock.now,
		() => `id-${++ids}`,
	);
	function ok<R extends MoveBookRequest>(request: R) {
		const response = book.apply(request);
		if (!response.ok) throw new Error(response.message);
		return response as MoveBookReplyFor<R["op"] & MoveBookOp>;
	}
	return { book, clock, ok };
}

function chat(sessionId: string): NewChatMove {
	return {
		sessionId,
		createdBy: "user-1",
		fromWorkspaceId: "laptop",
		fromHostId: "host-1",
		toWorkspaceId: "cloud",
		toHostId: null,
		sourceTurnSeq: 3,
		transcriptId: `transcript-${sessionId}`,
		harnessSessionId: "harness-1",
	};
}

function begin(ok: ReturnType<typeof newBook>["ok"]) {
	return ok({
		op: "begin",
		createdBy: "user-1",
		fromWorkspaceId: "laptop",
		fromHostId: "host-1",
		toHostId: null,
	}).move;
}

describe("MoveBook", () => {
	it("refuses a second move out of a workspace while one is in flight", () => {
		const { book, ok } = newBook();
		begin(ok);
		expect(
			book.apply({
				op: "begin",
				createdBy: "user-1",
				fromWorkspaceId: "laptop",
				fromHostId: null,
				toHostId: null,
			}),
		).toEqual({
			ok: false,
			code: "conflict",
			message: "This workspace is already moving",
		});
	});

	it("settles a workspace move from the newest attempt of each chat", () => {
		const { ok } = newBook();
		const parent = begin(ok);
		const [a, b] = ok({
			op: "attach",
			workspaceMoveId: parent.id,
			toWorkspaceId: "cloud",
			branch: "move/1",
			chats: [chat("a"), chat("b")],
		}).moves;
		ok({ op: "claim", id: a?.id as string });
		ok({ op: "finish", id: a?.id as string });
		ok({ op: "fail", id: b?.id as string, error: "no bundle" });
		expect(ok({ op: "workspaceMove", id: parent.id }).move?.status).toBe(
			"partial",
		);

		const retried = ok({
			op: "retry",
			workspaceMoveId: parent.id,
			chat: chat("b"),
		}).move;
		expect(ok({ op: "workspaceMove", id: parent.id }).move?.status).toBe(
			"moving",
		);
		ok({ op: "claim", id: retried.id });
		ok({ op: "finish", id: retried.id });
		const latest = ok({
			op: "latestWorkspaceMove",
			workspaceId: "cloud",
			createdBy: "user-1",
		});
		expect(latest.move?.status).toBe("ready");
		expect(latest.chats).toEqual({ total: 2, ready: 2, failed: 0 });
	});

	it("rolls back an attach when one of its chats is already moving", () => {
		const { book, ok } = newBook();
		const first = begin(ok);
		ok({
			op: "attach",
			workspaceMoveId: first.id,
			toWorkspaceId: "cloud",
			branch: "move/1",
			chats: [chat("a")],
		});
		const other = ok({
			op: "begin",
			createdBy: "user-1",
			fromWorkspaceId: "desk",
			fromHostId: null,
			toHostId: null,
		}).move;
		expect(
			book.apply({
				op: "attach",
				workspaceMoveId: other.id,
				toWorkspaceId: "cloud-2",
				branch: "move/2",
				chats: [chat("a")],
			}),
		).toMatchObject({ ok: false, code: "conflict" });
		expect(ok({ op: "workspaceMove", id: other.id }).move).toMatchObject({
			status: "pending",
			toWorkspaceId: null,
		});
	});

	it("fails moves that stopped answering and says when the next one goes stale", () => {
		const { book, clock, ok } = newBook();
		const parent = begin(ok);
		const [move] = ok({
			op: "attach",
			workspaceMoveId: parent.id,
			toWorkspaceId: "cloud",
			branch: "move/1",
			chats: [chat("a")],
		}).moves;
		expect(book.nextStaleAt()).toBe(clock.now + STALE_MOVE_MS);

		clock.now += STALE_MOVE_MS + 1;
		book.sweep();
		expect(ok({ op: "chatMove", id: move?.id as string }).move).toMatchObject({
			status: "failed",
			error: "The move stopped answering",
		});
		expect(ok({ op: "workspaceMove", id: parent.id }).move?.status).toBe(
			"failed",
		);
		expect(book.nextStaleAt()).toBeNull();
	});

	it("ages a chat waiting its turn by its workspace move, so the next stale time is never past", () => {
		const { book, clock, ok } = newBook();
		const parent = begin(ok);
		const [first] = ok({
			op: "attach",
			workspaceMoveId: parent.id,
			toWorkspaceId: "cloud",
			branch: "move/1",
			chats: [chat("a"), chat("b")],
		}).moves;
		clock.now += STALE_MOVE_MS / 2;
		ok({ op: "claim", id: first?.id as string });
		clock.now += STALE_MOVE_MS / 2 + 1;
		book.sweep();
		expect(book.nextStaleAt()).toBeGreaterThan(clock.now);
	});

	it("keeps a move that is still being worked on from going stale", () => {
		const { book, clock, ok } = newBook();
		const parent = begin(ok);
		clock.now += STALE_MOVE_MS - 1;
		expect(ok({ op: "touchWorkspaceMove", id: parent.id }).alive).toBe(true);
		const [move] = ok({
			op: "attach",
			workspaceMoveId: parent.id,
			toWorkspaceId: "cloud",
			branch: "move/1",
			chats: [chat("a")],
		}).moves;
		const id = move?.id as string;
		ok({ op: "claim", id });
		clock.now += STALE_MOVE_MS - 1;
		expect(ok({ op: "touchChatMove", id }).alive).toBe(true);
		clock.now += STALE_MOVE_MS - 1;
		book.sweep();
		expect(ok({ op: "chatMove", id }).move?.status).toBe("copying");
		clock.now += STALE_MOVE_MS;
		expect(ok({ op: "touchChatMove", id }).alive).toBe(false);
	});

	it("fails a ready move only when asked to", () => {
		const { ok } = newBook();
		const parent = begin(ok);
		const [move] = ok({
			op: "attach",
			workspaceMoveId: parent.id,
			toWorkspaceId: "cloud",
			branch: "move/1",
			chats: [chat("a")],
		}).moves;
		const id = move?.id as string;
		ok({ op: "claim", id });
		ok({ op: "finish", id });
		ok({ op: "fail", id, error: "late" });
		expect(ok({ op: "chatMove", id }).move?.status).toBe("ready");
		ok({ op: "fail", id, error: "switch failed", evenIfReady: true });
		expect(ok({ op: "chatMove", id }).move?.status).toBe("failed");
		expect(ok({ op: "workspaceMove", id: parent.id }).move).toMatchObject({
			status: "failed",
			error: "switch failed",
		});
	});

	it("ends the moves into a destination that will never answer", () => {
		const { ok } = newBook();
		const empty = begin(ok);
		ok({
			op: "attach",
			workspaceMoveId: empty.id,
			toWorkspaceId: "cloud",
			branch: "move/1",
			chats: [],
		});
		expect(ok({ op: "pendingInto", toWorkspaceId: "cloud" }).ids).toEqual([]);
		ok({ op: "failInto", toWorkspaceId: "cloud", error: "gone" });
		expect(ok({ op: "workspaceMove", id: empty.id }).move).toMatchObject({
			status: "failed",
			error: "gone",
		});
	});
});
