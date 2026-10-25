import { describe, expect, test } from "bun:test";
import {
	collapseWorkLog,
	type OutboxEntry,
	type TurnGroup,
} from "@superset/chat/core";
import type {
	ApprovalRequest,
	Item,
	ToolCall,
	UserMessage,
} from "@superset/chat/protocol";
import { pageLinkFinder } from "../../../../utils/pageLinks";
import { transcriptRows } from "./transcriptRows";

const WEB_URL = "https://app.superset.sh";
const REPORT = `${WEB_URL}/page/quarterly-report-a3f9k`;
const find = pageLinkFinder(WEB_URL);

const prompt: UserMessage = {
	id: "item-1",
	kind: "user_message",
	clientId: "client-1",
	startedAtMs: 1,
	content: [{ type: "text", text: "hi" }],
};

const sending: OutboxEntry = {
	commandId: "command-1",
	clientId: "client-1",
	content: prompt.content,
	state: "inflight",
	attempts: 1,
	lastError: null,
};

function group(turnId: string, running: boolean): TurnGroup {
	return {
		turnId,
		turn: running ? { id: turnId, status: "running", startedAtMs: 2 } : null,
		entries: [{ kind: "item", item: prompt }],
	};
}

function publish(id: string, startedAtMs: number): ToolCall {
	return {
		id,
		kind: "tool_call",
		title: "superset pages publish report.html",
		toolKind: "execute",
		toolName: "execute",
		status: "completed",
		content: [{ type: "text", text: `Published ${REPORT}\n` }],
		startedAtMs,
	};
}

describe("transcriptRows", () => {
	test("an approval is after its target only when the target row is right above", () => {
		const approval: ApprovalRequest = {
			id: "approval:tool-1",
			kind: "approval_request",
			targetItemId: "tool-1",
			title: "superset pages publish report.html",
			status: "answered",
			startedAtMs: 6,
		};
		const between = {
			id: "a1",
			kind: "agent_message" as const,
			text: "ok",
			startedAtMs: 5,
		};
		const rowsFor = (entries: TurnGroup["entries"]) =>
			transcriptRows(
				[{ turnId: "t1", turn: null, entries }],
				[],
				new Set(),
				find,
			).find((row) => row.kind === "item" && row.item.id === approval.id);

		const adjacent = rowsFor([
			{ kind: "tool_run", items: [publish("tool-1", 4)] },
			{ kind: "item", item: approval },
		]);
		const separated = rowsFor([
			{ kind: "tool_run", items: [publish("tool-1", 4)] },
			{ kind: "item", item: between },
			{ kind: "item", item: approval },
		]);

		expect(adjacent).toMatchObject({ afterTarget: true });
		expect(separated).not.toHaveProperty("afterTarget");
	});

	test("a prompt keeps one key from sending, through its echo, into its turn", () => {
		const pending = transcriptRows([], [sending], new Set(), find);
		const echoed = transcriptRows(
			[group("minted", false)],
			[sending],
			new Set(),
			find,
		);
		const attributed = transcriptRows([group("t1", true)], [], new Set(), find);

		expect(pending.map((row) => row.key)).toEqual(["client-1"]);
		expect(echoed.map((row) => row.key)).toEqual(["client-1"]);
		expect(
			attributed.filter((row) => row.kind === "item").map((row) => row.key),
		).toEqual(["client-1"]);
	});

	test("the turn clock sits under the prompt, above the agent's work", () => {
		const turn: TurnGroup = {
			turnId: "t1",
			turn: { id: "t1", status: "running", startedAtMs: 2 },
			entries: [
				{ kind: "item", item: prompt },
				{
					kind: "item",
					item: { id: "a1", kind: "agent_message", text: "ok", startedAtMs: 3 },
				},
			],
		};
		const rows = transcriptRows([turn], [], new Set(), find);
		expect(rows.map((row) => row.kind)).toEqual(["item", "working", "item"]);
		expect(rows[0]?.groupStart).toBe(true);
	});

	test("a message sent mid-turn moves the clock under it", () => {
		const steer = { ...prompt, id: "u2", clientId: "c2" };
		const rows = transcriptRows(
			[
				{
					turnId: "t1",
					turn: { id: "t1", status: "running", startedAtMs: 2 },
					entries: [
						{ kind: "item", item: prompt },
						{ kind: "item", item: publish("b1", 3) },
						{ kind: "item", item: steer },
					],
				},
			],
			[],
			new Set(),
			find,
		);
		expect(rows.map((row) => row.kind)).toEqual([
			"item",
			"item",
			"item",
			"working",
		]);
	});

	test("thinking between tool calls folds into one run, and a lone call stays a row", () => {
		const thought = (id: string, startedAtMs: number) => ({
			id,
			kind: "reasoning" as const,
			text: "thinking",
			startedAtMs,
		});
		const steps = (items: Item[]) =>
			transcriptRows(
				[
					{
						turnId: "t1",
						turn: { id: "t1", status: "completed", startedAtMs: 1 },
						entries: collapseWorkLog(items),
					},
				],
				[],
				new Set(),
				find,
			).flatMap((row) =>
				row.kind === "tool_run"
					? [row.steps.map((step) => step.id).join(" ")]
					: row.kind === "item"
						? [row.item.id]
						: [],
			);

		expect(
			steps([
				thought("r1", 2),
				publish("b1", 3),
				thought("r2", 4),
				publish("b2", 5),
				thought("r3", 6),
			]),
		).toEqual(["r1", "b1 r2 b2 r3"]);
		expect(steps([publish("b1", 3)])).toEqual(["b1"]);
	});

	test("a tool run starts collapsed unless it waits on an approval", () => {
		const running = { id: "t1", status: "running" as const, startedAtMs: 2 };
		const collapsedFlags = (pendingApprovalTargets: ReadonlySet<string>) =>
			transcriptRows(
				[
					{
						turnId: "t1",
						turn: running,
						entries: [
							{
								kind: "tool_run",
								items: [
									{
										id: "b1",
										kind: "tool_call",
										title: "b1",
										toolKind: "execute",
										toolName: "Bash",
										status: "running",
										content: [],
										startedAtMs: 3,
									},
									publish("b2", 4),
								],
							},
						],
					},
				],
				[],
				pendingApprovalTargets,
				find,
			)
				.filter((row) => row.kind === "tool_run")
				.map((row) => row.kind === "tool_run" && row.defaultCollapsed);

		expect(collapsedFlags(new Set())).toEqual([true]);
		expect(collapsedFlags(new Set(["b1"]))).toEqual([false]);
	});

	test("only a running turn's last row, when it is a tool run, is active", () => {
		const activeFlags = (
			status: "running" | "completed",
			after: TurnGroup["entries"],
		) =>
			transcriptRows(
				[
					{
						turnId: "t1",
						turn: { id: "t1", status, startedAtMs: 2 },
						entries: [
							{ kind: "tool_run", items: [publish("b1", 3), publish("b2", 4)] },
							...after,
						],
					},
				],
				[],
				new Set(),
				find,
			)
				.filter((row) => row.kind === "tool_run")
				.map((row) => row.kind === "tool_run" && row.active === true);
		const reply: TurnGroup["entries"][number] = {
			kind: "item",
			item: {
				id: "a1",
				kind: "agent_message",
				text: "done",
				startedAtMs: 5,
			},
		};

		expect(activeFlags("running", [])).toEqual([true]);
		expect(activeFlags("completed", [])).toEqual([false]);
		expect(activeFlags("running", [reply])).toEqual([false]);
	});

	test("a settled turn shows a page its tool run printed and its reply did not link", () => {
		const turn = (status: "running" | "completed"): TurnGroup => ({
			turnId: "t1",
			turn: { id: "t1", status, startedAtMs: 2 },
			entries: [
				{ kind: "item", item: prompt },
				{ kind: "tool_run", items: [publish("c1", 3), publish("c2", 4)] },
				{
					kind: "item",
					item: {
						id: "a1",
						kind: "agent_message",
						text: "Published.",
						startedAtMs: 5,
					},
				},
			],
		});
		const pagesOf = (status: "running" | "completed") =>
			transcriptRows([turn(status)], [], new Set(), find).flatMap((row) =>
				row.kind === "tool_run" ? [row.pages] : [],
			);

		expect(pagesOf("running")).toEqual([undefined]);
		expect(pagesOf("completed")).toEqual([
			[{ slug: "quarterly-report-a3f9k", url: REPORT }],
		]);
	});

	test("a page the reply links is left to the reply, once", () => {
		const turn: TurnGroup = {
			turnId: "t1",
			turn: { id: "t1", status: "completed", startedAtMs: 2 },
			entries: [
				{ kind: "item", item: publish("c1", 3) },
				{
					kind: "item",
					item: {
						id: "a1",
						kind: "agent_message",
						text: `Here it is: ${REPORT}`,
						startedAtMs: 4,
					},
				},
				{
					kind: "item",
					item: {
						id: "a2",
						kind: "agent_message",
						text: `As I said, ${REPORT}`,
						startedAtMs: 5,
					},
				},
			],
		};
		const rows = transcriptRows([turn], [], new Set(), find);
		const byId = Object.fromEntries(
			rows.flatMap((row) => (row.kind === "item" ? [[row.item.id, row]] : [])),
		);
		expect(byId.c1).not.toHaveProperty("pages");
		expect(byId.a1).not.toHaveProperty("pagesShownEarlier");
		expect(byId.a2).toHaveProperty(
			"pagesShownEarlier",
			"quarterly-report-a3f9k",
		);
	});
});

test("a subagent's task call leaves its tool run", () => {
	const tool = (id: string): ToolCall => ({
		id,
		kind: "tool_call",
		title: id,
		toolKind: "read",
		toolName: "read",
		status: "completed",
		content: [],
		startedAtMs: 1,
	});
	const rows = transcriptRows(
		[
			{
				turnId: "t1",
				turn: null,
				entries: [
					{
						kind: "tool_run",
						items: [tool("r1"), tool("r2"), tool("task-1"), tool("r3")],
					},
				],
			},
		],
		[],
		new Set(),
		find,
		new Set(),
		(each) => each.id === "task-1",
	);
	expect(
		rows.map((row) =>
			row.kind === "tool_run"
				? row.items.map((each) => each.id)
				: row.kind === "item"
					? row.item.id
					: row.kind,
		),
	).toEqual([["r1", "r2"], "task-1", "r3"]);
});
