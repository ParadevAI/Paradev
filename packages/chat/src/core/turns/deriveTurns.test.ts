import { expect, test } from "bun:test";
import type { Turn } from "../../protocol/envelope";
import type {
	AgentMessage,
	ApprovalRequest,
	Item,
	ToolCall,
	UserMessage,
} from "../../protocol/items";
import type { OutboxEntry } from "../outbox/outbox";
import type { StoredItem } from "../reducer/reducer";
import { createTurnDeriver, type TurnsInput } from "./deriveTurns";

function user(id: string, at: number, extra: Partial<UserMessage> = {}) {
	return {
		id,
		kind: "user_message",
		content: [{ type: "text", text: id }],
		startedAtMs: at,
		...extra,
	} as UserMessage;
}

function reply(id: string, at: number, text = "done"): AgentMessage {
	return { id, kind: "agent_message", text, startedAtMs: at };
}

function tool(id: string, at: number, extra: Partial<ToolCall> = {}): ToolCall {
	return {
		id,
		kind: "tool_call",
		title: id,
		toolKind: "read",
		toolName: "read",
		status: "completed",
		content: [],
		startedAtMs: at,
		...extra,
	};
}

function running(id: string, at: number): Turn {
	return { id, status: "running", startedAtMs: at };
}

function log(
	entries: [turnId: string, item: Item][],
	turns: Turn[],
	liveStreams = new Map<string, string>(),
): TurnsInput {
	return {
		items: new Map<string, StoredItem>(
			entries.map(([turnId, item]) => [item.id, { item, turnId }]),
		),
		turns: new Map(turns.map((turn) => [turn.id, turn])),
		liveStreams,
	};
}

function sent(clientId: string, state: OutboxEntry["state"] = "inflight") {
	return {
		commandId: `command-${clientId}`,
		clientId,
		content: [{ type: "text", text: clientId }],
		state,
		attempts: 1,
		lastError: null,
	} as OutboxEntry;
}

test("groups items into turns in the order they started", () => {
	const derive = createTurnDeriver();
	const turns = derive(
		log(
			[
				["t2", reply("a2", 21)],
				["t1", reply("a1", 11)],
				["t2", user("u2", 20)],
				["t1", user("u1", 10)],
			],
			[running("t2", 20), running("t1", 10)],
		),
	);
	expect(turns.map((turn) => turn.id)).toEqual(["t1", "t2"]);
	expect(turns[0]?.parts.map((part) => part.id)).toEqual(["u1", "a1"]);
});

test("streamed text re-makes only the message it belongs to", () => {
	const derive = createTurnDeriver();
	const entries: [string, Item][] = [
		["t1", user("u1", 10)],
		["t1", reply("a1", 11)],
		["t2", user("u2", 20)],
		["t2", reply("a2", 21, "")],
	];
	const turnList = [running("t1", 10), running("t2", 20)];
	const first = derive(log(entries, turnList));
	const base = log(entries, turnList);
	const second = derive({
		...base,
		liveStreams: new Map([["text:a2", "Looking"]]),
	});

	expect(second[0]).toBe(first[0]);
	expect(second[1]).not.toBe(first[1]);
	expect(second[1]?.parts[0]).toBe(first[1]?.parts[0]);
	expect((second[1]?.parts[1] as AgentMessage).text).toBe("Looking");
});

test("new maps holding the same items and turns give back the same turns", () => {
	const derive = createTurnDeriver();
	const entries: [string, Item][] = [["t1", user("u1", 10)]];
	const turnList = [running("t1", 10)];
	const first = derive(log(entries, turnList));
	const second = derive(log(entries, turnList));
	expect(second).toBe(first);
});

test("a subagent call carries what it produced", () => {
	const derive = createTurnDeriver();
	const call = tool("subagent:1", 11, { subagent: true });
	const turns = derive(
		log(
			[
				["t1", call],
				["t1", tool("read-1", 12, { parentItemId: call.id })],
			],
			[running("t1", 10)],
		),
	);
	expect(turns[0]?.parts.map((part) => part.id)).toEqual(["subagent:1"]);
	expect(turns[0]?.parts[0]?.children?.map((part) => part.id)).toEqual([
		"read-1",
	]);
});

test("a pending approval carries its target and who asked", () => {
	const derive = createTurnDeriver();
	const subagent = tool("subagent:1", 11, { subagent: true, title: "Explore" });
	const target = tool("read-1", 12, { parentItemId: subagent.id });
	const approval: ApprovalRequest = {
		id: "approval-1",
		kind: "approval_request",
		parentItemId: subagent.id,
		targetItemId: target.id,
		title: "Read?",
		status: "pending",
		startedAtMs: 13,
	};
	const turns = derive(
		log(
			[
				["t1", subagent],
				["t1", target],
				["t1", approval],
			],
			[running("t1", 10)],
		),
	);
	const part = turns[0]?.parts.find((each) => each.id === "approval-1");
	expect(part?.approvalTarget?.id).toBe("read-1");
	expect(part?.approvalAsker?.title).toBe("Explore");
});

test("a prompt sent from here is a turn until the host echoes it", () => {
	const derive = createTurnDeriver();
	const outbox = [sent("c1")];
	const waiting = derive(log([], []), outbox);
	expect(waiting.map((turn) => [turn.id, turn.sending])).toEqual([
		["pending:c1", "sending"],
	]);

	const echoed = derive(
		log([["t1", user("u1", 10, { clientId: "c1" })]], [running("t1", 10)]),
		outbox,
	);
	expect(echoed.map((turn) => turn.id)).toEqual(["t1"]);
});

test("queued and discarded prompts are not in a turn", () => {
	const derive = createTurnDeriver();
	const turns = derive(
		log(
			[
				["t1", user("u1", 10)],
				["t1", user("q1", 11, { queued: true })],
				["t1", user("d1", 12, { discarded: true })],
			],
			[running("t1", 10)],
		),
	);
	expect(turns[0]?.parts.map((part) => part.id)).toEqual(["u1"]);
});
