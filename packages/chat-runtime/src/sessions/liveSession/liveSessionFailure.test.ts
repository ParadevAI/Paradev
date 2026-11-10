import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { DurableEnvelope, Item, Turn } from "@superset/chat/protocol";
import type { AdapterEvent, HarnessAdapter } from "../../harness";
import { FakeHarness } from "../../harness/fake";
import type { ChatRuntime } from "../../index";
import type { HarnessRegistry } from "../../sessions";
import { createTestRuntime } from "../../testing/testRuntime";
import { journalEnvelopes, waitFor } from "../../testing/testUtils";

const HARNESS = "failing";

function registryFor(adapter: HarnessAdapter): HarnessRegistry {
	return new Map([[HARNESS, () => adapter]]);
}

function failingStream(
	events: AdapterEvent[],
	message: string,
): HarnessAdapter {
	return {
		start: () => ({
			async *[Symbol.asyncIterator]() {
				for (const event of events) yield event;
				throw new Error(message);
			},
		}),
		prompt: () => undefined,
		cancelTurn: () => undefined,
		respondToApproval: () => undefined,
		setMode: () => Promise.resolve(true),
		dispose: async () => undefined,
	};
}

function hangingStream(events: AdapterEvent[]): HarnessAdapter {
	let release = () => {};
	const done = new Promise<void>((resolve) => {
		release = resolve;
	});
	return {
		start: () => ({
			async *[Symbol.asyncIterator]() {
				for (const event of events) yield event;
				await done;
			},
		}),
		prompt: () => undefined,
		cancelTurn: () => undefined,
		respondToApproval: () => undefined,
		setMode: async () => true,
		dispose: async () => release(),
	};
}

const RUNNING_TURN: AdapterEvent = {
	kind: "turn",
	turn: { id: "turn-1", status: "running", startedAtMs: 1 },
};

const RUNNING_TOOL: AdapterEvent = {
	kind: "item",
	turnId: "turn-1",
	item: {
		id: "tool-1",
		kind: "tool_call",
		startedAtMs: 2,
		title: "Run tests",
		toolKind: "execute",
		toolName: "Bash",
		status: "running",
		content: [],
	},
};

const PENDING_APPROVAL: AdapterEvent = {
	kind: "item",
	turnId: "turn-1",
	item: {
		id: "approval-1",
		kind: "approval_request",
		startedAtMs: 3,
		targetItemId: "tool-1",
		title: "Run tests?",
		status: "pending",
	},
};

function stoppableStream(events: AdapterEvent[]): HarnessAdapter {
	let stop = () => {};
	const stopped = new Promise<void>((resolve) => {
		stop = resolve;
	});
	let release = () => {};
	const done = new Promise<void>((resolve) => {
		release = resolve;
	});
	return {
		start: () => ({
			async *[Symbol.asyncIterator]() {
				for (const event of events) yield event;
				await stopped;
				yield {
					kind: "turn",
					turn: { id: "turn-1", status: "interrupted", startedAtMs: 1 },
				};
				yield { kind: "session", session: { status: "idle" } };
				await done;
			},
		}),
		prompt: () => undefined,
		cancelTurn: () => stop(),
		respondToApproval: () => undefined,
		setMode: async () => true,
		dispose: async () => release(),
	};
}

function endingStream(events: AdapterEvent[]): HarnessAdapter {
	return {
		start: () => ({
			async *[Symbol.asyncIterator]() {
				for (const event of events) yield event;
			},
		}),
		prompt: () => undefined,
		cancelTurn: () => undefined,
		respondToApproval: () => undefined,
		setMode: async () => true,
		dispose: async () => undefined,
	};
}

function waitForTurn(runtime: ChatRuntime, sessionId: string): Promise<void> {
	return waitFor(() =>
		journalEnvelopes(runtime, sessionId).some(
			(envelope) => envelope.event.type === "turn",
		),
	);
}

function lastTurn(runtime: ChatRuntime, sessionId: string): Turn | undefined {
	return journalEnvelopes(runtime, sessionId)
		.flatMap((envelope) =>
			envelope.event.type === "turn" ? [envelope.event.turn] : [],
		)
		.at(-1);
}

function latestItems(
	runtime: ChatRuntime,
	sessionId: string,
): Map<string, Item> {
	const items = new Map<string, Item>();
	for (const envelope of journalEnvelopes(runtime, sessionId)) {
		if (envelope.event.type === "item") {
			items.set(envelope.event.item.id, envelope.event.item);
		}
	}
	return items;
}

class PromptThrows extends FakeHarness {
	prompt(): void {
		throw new Error("prompt rejected");
	}
}

function startSession(adapter: HarnessAdapter): {
	runtime: ChatRuntime;
	sessionId: string;
} {
	const runtime = createTestRuntime({ harnesses: registryFor(adapter) });
	const { sessionId } = runtime.commands.createSession({
		commandId: randomUUID(),
		scopeId: "workspace-1",
		harness: HARNESS,
		cwd: "/tmp/workspace",
	});
	return { runtime, sessionId };
}

function statuses(envelopes: DurableEnvelope[]): string[] {
	return envelopes
		.filter((envelope) => envelope.event.type === "session")
		.map((envelope) =>
			envelope.event.type === "session" ? envelope.event.session.status : "",
		);
}

describe("live session adapter failures", () => {
	test("a rejected pump journals the failure instead of going unhandled", async () => {
		const runningTurn: AdapterEvent = {
			kind: "turn",
			turn: { id: "turn-1", status: "running", startedAtMs: 1 },
		};
		const { runtime, sessionId } = startSession(
			failingStream([runningTurn], "stream exploded"),
		);

		await waitFor(() =>
			statuses(journalEnvelopes(runtime, sessionId)).includes("dead"),
		);
		const envelopes = journalEnvelopes(runtime, sessionId);

		const turns = envelopes.flatMap((envelope) =>
			envelope.event.type === "turn" ? [envelope.event.turn] : [],
		);
		expect(turns.at(-1)).toMatchObject({
			status: "failed",
			error: { kind: "crashed", message: "stream exploded" },
		});

		const notices = envelopes.flatMap((envelope) =>
			envelope.event.type === "item" && envelope.event.item.kind === "notice"
				? [envelope.event.item]
				: [],
		);
		expect(notices.at(-1)).toMatchObject({
			noticeKind: "error",
			text: "stream exploded",
		});

		await runtime.dispose();
	});

	test("closing a session mid-turn reads as a stop the user made", async () => {
		const { runtime, sessionId } = startSession(hangingStream([RUNNING_TURN]));
		await waitForTurn(runtime, sessionId);

		await runtime.live.dispose(sessionId);

		const turn = lastTurn(runtime, sessionId);
		expect(turn).toMatchObject({ id: "turn-1", status: "interrupted" });
		expect(turn?.error).toBeUndefined();
		await runtime.dispose();
	});

	test("a host shutdown mid-turn settles the turn and what it left running", async () => {
		const { runtime, sessionId } = startSession(
			hangingStream([RUNNING_TURN, RUNNING_TOOL, PENDING_APPROVAL]),
		);
		await waitForTurn(runtime, sessionId);

		await runtime.live.disposeAll();

		expect(lastTurn(runtime, sessionId)).toMatchObject({
			status: "interrupted",
			error: { kind: "host_stopped" },
		});
		const items = latestItems(runtime, sessionId);
		expect(items.get("tool-1")).toMatchObject({ status: "canceled" });
		expect(items.get("approval-1")).toMatchObject({ status: "stale" });
		await runtime.dispose();
	});

	test("a turn the user stopped cancels its own commands, not ones sent to the background", async () => {
		const background: AdapterEvent = {
			kind: "item",
			turnId: "turn-1",
			item: {
				...(RUNNING_TOOL.kind === "item" ? RUNNING_TOOL.item : {}),
				id: "tool-bg",
			} as Item,
		};
		const { runtime, sessionId } = startSession(
			stoppableStream([
				RUNNING_TURN,
				RUNNING_TOOL,
				background,
				{
					kind: "session",
					session: {
						status: "running",
						backgroundTasks: [
							{
								id: "tool-bg",
								kind: "process",
								name: "dev server",
								canStop: true,
								startedAtMs: 2,
							},
						],
					},
				},
			]),
		);
		await waitForTurn(runtime, sessionId);

		runtime.live.require(sessionId).cancelTurn();
		await waitFor(() => lastTurn(runtime, sessionId)?.status === "interrupted");

		const items = latestItems(runtime, sessionId);
		expect(items.get("tool-1")).toMatchObject({ status: "canceled" });
		expect(items.get("tool-bg")).toMatchObject({ status: "running" });
		await runtime.dispose();
	});

	test("a session cut off before its agent said anything is settled at boot only once", async () => {
		const runtime = createTestRuntime();
		runtime.journal.open({
			sessionId: "never-started",
			scopeId: "workspace-1",
			harness: "fake",
		});

		expect(runtime.journal.settleAllStranded(Date.now())).toEqual([
			"never-started",
		]);
		expect(runtime.sessions.get("never-started")?.status).toBe("idle");
		expect(runtime.journal.settleAllStranded(Date.now())).toEqual([]);
		await runtime.dispose();
	});

	test("the boot sweep settles a turn the journal still shows running", async () => {
		const { runtime, sessionId } = startSession(
			hangingStream([RUNNING_TURN, RUNNING_TOOL, PENDING_APPROVAL]),
		);
		await waitForTurn(runtime, sessionId);

		expect(runtime.journal.settleAllStranded(Date.now())).toEqual([sessionId]);

		expect(lastTurn(runtime, sessionId)).toMatchObject({
			status: "interrupted",
			error: { kind: "host_stopped" },
		});
		expect(latestItems(runtime, sessionId).get("approval-1")).toMatchObject({
			status: "stale",
		});
		expect(statuses(journalEnvelopes(runtime, sessionId)).at(-1)).toBe("idle");
		expect(runtime.journal.settleAllStranded(Date.now())).toEqual([]);
		await runtime.dispose();
	});

	test("an agent whose stream ends mid-turn fails the turn as a crash", async () => {
		const { runtime, sessionId } = startSession(
			endingStream([RUNNING_TURN, RUNNING_TOOL]),
		);
		await waitFor(() =>
			statuses(journalEnvelopes(runtime, sessionId)).includes("dead"),
		);

		expect(lastTurn(runtime, sessionId)).toMatchObject({
			status: "failed",
			error: { kind: "crashed" },
		});
		expect(latestItems(runtime, sessionId).get("tool-1")).toMatchObject({
			status: "canceled",
		});
		await runtime.dispose();
	});

	test("a session whose stream died still disposes cleanly", async () => {
		const { runtime, sessionId } = startSession(
			failingStream([], "stream exploded"),
		);
		await waitFor(() =>
			statuses(journalEnvelopes(runtime, sessionId)).includes("dead"),
		);
		await expect(runtime.dispose()).resolves.toBeUndefined();
	});

	test("a throwing prompt does not wedge the queue", async () => {
		const { runtime, sessionId } = startSession(
			new PromptThrows({ turns: [[]] }),
		);

		expect(() =>
			runtime.commands.prompt({
				commandId: randomUUID(),
				sessionId,
				clientId: "client-1",
				content: [{ type: "text", text: "first" }],
			}),
		).toThrow("prompt rejected");

		const session = runtime.live.require(sessionId);
		expect(session.queuedCount).toBe(0);

		expect(() =>
			runtime.commands.prompt({
				commandId: randomUUID(),
				sessionId,
				clientId: "client-2",
				content: [{ type: "text", text: "second" }],
			}),
		).toThrow("prompt rejected");
		expect(session.queuedCount).toBe(0);

		await runtime.dispose();
	});
});
