import { describe, expect, test } from "bun:test";
import {
	deriveTimeline,
	type OutboxEntry,
	type StoredItem,
	type TurnGroup,
} from "@superset/chat/core";
import type { Item } from "@superset/chat/protocol";
import {
	chatRows,
	groupActivity,
	groupPositions,
	lastReplyKeys,
} from "./chatRows";

const turn = (id: string, status: "running" | "completed") => ({
	id,
	status,
	startedAtMs: 1,
});

const user = (id: string, clientId: string) => ({
	id,
	kind: "user_message" as const,
	clientId,
	content: [{ type: "text" as const, text: "hi" }],
	startedAtMs: 1,
});

const outbox = (clientId: string): OutboxEntry => ({
	commandId: `c-${clientId}`,
	clientId,
	content: [{ type: "text", text: "hi" }],
	state: "inflight",
	attempts: 1,
	lastError: null,
});

describe("chatRows", () => {
	test("an echoed prompt replaces its outbox bubble under the same key", () => {
		const groups: TurnGroup[] = [
			{
				turn: turn("t1", "completed"),
				turnId: "t1",
				entries: [{ kind: "item", item: user("u1", "client-1") }],
			},
		];
		const rows = chatRows(groups, [outbox("client-1"), outbox("client-2")]);
		expect(rows.map((row) => [row.kind, row.key])).toEqual([
			["item", "client-1"],
			["outbox", "client-2"],
		]);
	});

	test("a running turn with nothing live ends with a working line", () => {
		const groups: TurnGroup[] = [
			{
				turn: turn("t1", "running"),
				turnId: "t1",
				entries: [{ kind: "item", item: user("u1", "client-1") }],
			},
		];
		expect(chatRows(groups, []).at(-1)?.kind).toBe("working");
	});

	test("a stop recorded in the agent's history is a stopped line where it happened", () => {
		const groups: TurnGroup[] = [
			{
				turn: turn("t1", "completed"),
				turnId: "t1",
				entries: [
					{
						kind: "user_stop",
						item: {
							id: "s1",
							kind: "user_message",
							startedAtMs: 1,
							content: [
								{ type: "text", text: "[Request interrupted by user]" },
							],
						},
						stop: "response",
					},
					{ kind: "item", item: user("u1", "client-1") },
				],
			},
		];
		expect(chatRows(groups, []).map((row) => [row.kind, row.key])).toEqual([
			["turn_status", "stop:s1"],
			["item", "client-1"],
		]);
	});

	test("a stopped turn whose stop the agent recorded says so once", () => {
		const groups: TurnGroup[] = [
			{
				turn: { id: "t1", status: "interrupted", startedAtMs: 1 },
				turnId: "t1",
				entries: [
					{ kind: "item", item: user("u1", "client-1") },
					{
						kind: "user_stop",
						item: {
							id: "s1",
							kind: "user_message",
							startedAtMs: 2,
							content: [
								{ type: "text", text: "[Request interrupted by user]" },
							],
						},
						stop: "response",
					},
				],
			},
		];
		expect(
			chatRows(groups, []).filter((row) => row.kind === "turn_status"),
		).toHaveLength(1);
	});
});

describe("a turn that ended without the user", () => {
	const notice = (text: string) => ({
		kind: "item" as const,
		item: {
			id: "n1",
			kind: "notice" as const,
			noticeKind: "error" as const,
			text,
			startedAtMs: 2,
		},
	});

	test("a turn Paradev's shutdown paused reads as paused, once, without the red notice", () => {
		const groups: TurnGroup[] = [
			{
				turn: {
					id: "t1",
					status: "interrupted",
					startedAtMs: 1,
					error: {
						message: "Commands the agent was running were stopped.",
						kind: "host_stopped",
					},
				},
				turnId: "t1",
				entries: [
					{ kind: "item", item: user("u1", "client-1") },
					notice("Commands the agent was running were stopped."),
				],
			},
		];
		expect(
			chatRows(groups, []).map((row) =>
				row.kind === "turn_status" ? row.status : row.kind,
			),
		).toEqual(["item", "paused"]);
	});

	test("a failed turn's notice folds into its status line, keeping the detail", () => {
		const groups: TurnGroup[] = [
			{
				turn: {
					id: "t1",
					status: "failed",
					startedAtMs: 1,
					error: { message: "The agent exited", kind: "crashed" },
				},
				turnId: "t1",
				entries: [notice("The agent exited\nexit code 1")],
			},
		];
		expect(chatRows(groups, [])).toEqual([
			{
				kind: "turn_status",
				key: "status:t1",
				status: "failed",
				message: "The agent exited\nexit code 1",
			},
		]);
	});
});

describe("groupPositions", () => {
	test("consecutive rows from one side join, and system rows break the run", () => {
		const groups: TurnGroup[] = [
			{
				turnId: "t1",
				turn: turn("t1", "completed"),
				entries: [
					{ kind: "item", item: user("u1", "c1") },
					{ kind: "item", item: user("u2", "c2") },
					{
						kind: "item",
						item: {
							id: "a1",
							kind: "agent_message",
							text: "a",
							startedAtMs: 1,
						},
					},
					{
						kind: "item",
						item: {
							id: "n1",
							kind: "notice",
							noticeKind: "info",
							text: "n",
							startedAtMs: 1,
						},
					},
					{
						kind: "item",
						item: {
							id: "a2",
							kind: "agent_message",
							text: "b",
							startedAtMs: 1,
						},
					},
				],
			} as unknown as TurnGroup,
		];
		expect(groupPositions(chatRows(groups, []))).toEqual([
			"first",
			"last",
			"single",
			"single",
			"single",
		]);
	});
});

describe("groupActivity", () => {
	const reasoning = (id: string) => ({
		kind: "item" as const,
		key: id,
		item: { id, kind: "reasoning", startedAtMs: 1, completedAtMs: 2 },
	});
	const message = (id: string) => ({
		kind: "item" as const,
		key: id,
		item: { id, kind: "agent_message", text: "", startedAtMs: 1 },
	});
	const prompt = (id: string) => ({
		kind: "item" as const,
		key: id,
		item: { id, kind: "user_message" },
	});
	const keys = (rows: unknown[]) =>
		groupActivity(rows as Parameters<typeof groupActivity>[0]).map(
			(row) => row.key,
		);

	test("the work before the latest message folds into one row, the steps after it into another", () => {
		expect(
			keys([
				prompt("u1"),
				reasoning("r1"),
				{ kind: "tool_run", key: "t1", items: [] },
				message("m1"),
				reasoning("r2"),
				message("m2"),
				reasoning("r3"),
				prompt("u2"),
				message("m3"),
			]),
		).toEqual(["u1", "activity:r1", "m2", "activity:r3", "u2", "m3"]);
	});

	test("messages with no steps between them stay on screen", () => {
		expect(keys([message("m1"), message("m2")])).toEqual(["m1", "m2"]);
	});
});

describe("lastReplyKeys", () => {
	test("the last reply of each agent turn, even with activity after it", () => {
		const rows = [
			{ kind: "item", key: "u1", item: { id: "u1", kind: "user_message" } },
			{ kind: "item", key: "a1", item: { id: "a1", kind: "agent_message" } },
			{ kind: "item", key: "a2", item: { id: "a2", kind: "agent_message" } },
			{ kind: "activity", key: "act", rows: [] },
			{ kind: "item", key: "u2", item: { id: "u2", kind: "user_message" } },
			{ kind: "item", key: "a3", item: { id: "a3", kind: "agent_message" } },
		] as unknown as Parameters<typeof lastReplyKeys>[0];
		expect([...lastReplyKeys(rows)]).toEqual(["a2", "a3"]);
	});
});

describe("subagent approvals", () => {
	test("a pending approval from a subagent is a top-level row", () => {
		const items: Item[] = [
			{
				id: "subagent:c1",
				kind: "tool_call",
				title: "Explore",
				toolKind: "think",
				toolName: "subagent",
				status: "running",
				content: [],
				startedAtMs: 1,
				subagent: true,
			},
			{
				id: "approval:sub:c1:bash-1",
				kind: "approval_request",
				targetItemId: "sub:c1:bash-1",
				title: "Allow Bash?",
				status: "pending",
				startedAtMs: 2,
				parentItemId: "subagent:c1",
			},
		];
		const groups = deriveTimeline(
			{
				items: new Map<string, StoredItem>(
					items.map((item) => [item.id, { item, turnId: "t1" }]),
				),
				turns: new Map([["t1", turn("t1", "running")]]),
			},
			{ nestChildItems: true },
		);
		const rows = groupActivity(chatRows(groups, []));
		expect(
			rows.some(
				(row) =>
					row.kind === "item" && row.item.id === "approval:sub:c1:bash-1",
			),
		).toBe(true);
	});
});
