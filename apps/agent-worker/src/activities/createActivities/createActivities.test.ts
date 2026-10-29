import { describe, expect, test } from "bun:test";
import {
	type AssistantMessage,
	createAssistantMessageEventStream,
} from "@earendil-works/pi-ai";
import type { HostJobs } from "@superset/agent-harness";
import { ApplicationFailure } from "@temporalio/common";
import type { TurnCredentials } from "../../clients/credentials";
import type {
	AppendInput,
	SessionStore,
	TranscriptRow,
} from "../../clients/sessionStore";
import type { SettleTurnInput } from "../../clients/settler";
import { createActivities, type StreamFn } from "./createActivities";

const credentials: TurnCredentials = {
	sessionStore: { baseUrl: "http://store", writeTicket: "t" },
	host: { url: "http://host", bearer: "b", workspaceId: "w1" },
	model: { baseUrl: "http://model", modelId: "m", headers: {} },
};

function memoryStore() {
	const appends: AppendInput[] = [];
	const rows: TranscriptRow[] = [];
	const failNext = { append: false };
	const store: SessionStore = {
		async append(input) {
			if (failNext.append) {
				failNext.append = false;
				throw new Error("store unavailable");
			}
			if (appends.some((a) => a.stepKey === input.stepKey)) {
				return { duplicate: true };
			}
			appends.push(input);
			for (const entry of input.transcript ?? []) {
				rows.push({ seq: rows.length + 1, stepKey: input.stepKey, entry });
			}
			return { duplicate: false };
		},
		async transcript() {
			return rows;
		},
		async transcriptStep(stepKey) {
			return rows.filter((row) => row.stepKey === stepKey);
		},
	};
	return { store, appends, rows, failNext };
}

function fakeHost(): HostJobs & { commands: string[] } {
	const commands: string[] = [];
	return {
		commands,
		async exec(input: { command: string }) {
			commands.push(input.command);
			return { jobId: "j1", status: "running", pid: 1, logPath: "/tmp/j1.log" };
		},
		async output(input: { fromOffset?: number }) {
			const first = !input.fromOffset;
			return {
				chunk: first ? "4 pass\n" : "",
				nextOffset: 7,
				status: "done",
				exitCode: 0,
				matched: false,
				logPath: "/tmp/j1.log",
			};
		},
		async kill() {
			return { status: "killed" };
		},
		async readFile() {
			throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
		},
		async writeFile() {
			return {};
		},
		async mkdir() {
			return {};
		},
		async stat() {
			throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
		},
		async readdir() {
			return { entries: [] };
		},
	} as unknown as HostJobs & { commands: string[] };
}

function assistant(content: AssistantMessage["content"]): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "anthropic-messages",
		provider: "superset-router",
		model: "m",
		usage: {
			input: 10,
			output: 5,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 15,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.001 },
		},
		stopReason: content.some((block) => block.type === "toolCall")
			? "toolUse"
			: "stop",
		timestamp: 0,
	} as AssistantMessage;
}

function scriptedModel(replies: AssistantMessage[]) {
	let calls = 0;
	const contexts: Array<{ tools?: unknown[]; systemPrompt?: string }> = [];
	const stream: StreamFn = (_model, context) => {
		contexts.push(context as { tools?: unknown[]; systemPrompt?: string });
		const reply = replies[calls++];
		if (!reply) throw new Error("no more replies");
		const events = createAssistantMessageEventStream();
		queueMicrotask(() => {
			events.push({
				type: "done",
				reason: reply.stopReason,
				message: reply,
			} as never);
			events.end(reply);
		});
		return events;
	};
	return { stream, calls: () => calls, contexts };
}

function setup(
	replies: AssistantMessage[],
	creds: TurnCredentials = credentials,
) {
	const posts: Array<{ body: string; idempotencyKey: string }> = [];
	const memory = memoryStore();
	const host = fakeHost();
	const model = scriptedModel(replies);
	const settled: SettleTurnInput[] = [];
	const turn = { running: true };
	const activities = createActivities({
		credentials: {
			forTurn: async () => {
				if (!turn.running) {
					throw ApplicationFailure.nonRetryable(
						"Turn is not running.",
						"TurnNotRunning",
					);
				}
				return creds;
			},
		},
		settler: {
			async settle(input) {
				settled.push(input);
				turn.running = false;
				return { steerPending: false, sessionStore: credentials.sessionStore };
			},
		},
		stream: model.stream,
		modelPrice: async () => ({
			input: 2,
			output: 10,
			cacheRead: 0,
			cacheWrite: 0,
		}),
		roomPoster: () => ({
			post: async (input) => {
				posts.push(input);
				return { messageId: `m${posts.length}` };
			},
		}),
		sessionStore: () => memory.store,
		hostJobs: () => host,
		workspaceContext: async () => ({ cwd: "/repo" }),
		readAgentsMd: async () => null,
		flushEveryMs: 0,
	});
	return { activities, memory, host, model, settled, turn, posts };
}

const ref = { sessionId: "s1", turnId: "t1" };

describe("agent activities", () => {
	test("a retried model step returns the stored reply without calling the model again", async () => {
		const { activities, model } = setup([
			assistant([
				{
					type: "toolCall",
					id: "c1",
					name: "bash",
					arguments: { command: "bun test" },
				},
			]),
		]);
		await activities.beginTurn({ ...ref, promptId: "p1", text: "run tests" });
		const first = await activities.modelStep({ ...ref, step: 0 });
		const retry = await activities.modelStep({ ...ref, step: 0 });
		expect(first.toolCalls).toEqual([{ id: "c1", name: "bash" }]);
		expect(retry).toEqual(first);
		expect(model.calls()).toBe(1);
	});

	test("a retried tool step does not run the command twice", async () => {
		const { activities, host, memory } = setup([
			assistant([
				{
					type: "toolCall",
					id: "c1",
					name: "bash",
					arguments: { command: "bun test" },
				},
			]),
		]);
		await activities.beginTurn({ ...ref, promptId: "p1", text: "run tests" });
		await activities.modelStep({ ...ref, step: 0 });
		const first = await activities.toolStep({
			...ref,
			step: 0,
			toolCallId: "c1",
		});
		const retry = await activities.toolStep({
			...ref,
			step: 0,
			toolCallId: "c1",
		});
		expect(first).toEqual({ isError: false });
		expect(retry).toEqual(first);
		expect(host.commands).toHaveLength(1);
		const result = memory.rows.find((row) => row.stepKey === "t1/s0/c1/end");
		expect(JSON.stringify(result?.entry)).toContain("4 pass");
	});

	test("settling sends the reply, tool calls, usage and steers read", async () => {
		const { activities, settled, memory } = setup([
			assistant([
				{
					type: "toolCall",
					id: "c1",
					name: "bash",
					arguments: { command: "bun test" },
				},
			]),
			assistant([{ type: "text", text: "All 4 tests pass." }]),
		]);
		await activities.beginTurn({ ...ref, promptId: "p1", text: "run tests" });
		await activities.modelStep({ ...ref, step: 0 });
		await activities.toolStep({ ...ref, step: 0, toolCallId: "c1" });
		await activities.modelStep({ ...ref, step: 1 });
		await activities.settleTurn({
			...ref,
			outcome: "completed",
			steersConsumed: 1,
		});
		expect(settled).toHaveLength(1);
		expect(settled[0]).toMatchObject({
			turnId: "t1",
			status: "completed",
			reply: "All 4 tests pass.",
			inputTokens: 20,
			outputTokens: 10,
			steersConsumed: 1,
		});
		expect(settled[0]?.toolCalls?.[0]).toMatchObject({
			name: "bash",
			status: "done",
		});
		expect(memory.appends.at(-1)?.turnEnd?.status).toBe("completed");
	});

	test("a settle retried after the turn was recorded still writes the end", async () => {
		const { activities, settled, memory } = setup([
			assistant([{ type: "text", text: "Done." }]),
		]);
		await activities.beginTurn({ ...ref, promptId: "p1", text: "hi" });
		await activities.modelStep({ ...ref, step: 0 });
		memory.failNext.append = true;
		const settle = { ...ref, outcome: "completed" as const, steersConsumed: 0 };
		await expect(activities.settleTurn(settle)).rejects.toThrow(
			"store unavailable",
		);
		await activities.settleTurn(settle);
		expect(settled).toHaveLength(2);
		expect(memory.appends.at(-1)?.turnEnd?.status).toBe("completed");
	});

	test("a session without a workspace gets no tools", async () => {
		const { activities, model } = setup(
			[assistant([{ type: "text", text: "Hi." }])],
			{ ...credentials, host: null },
		);
		await activities.beginTurn({ ...ref, promptId: "p1", text: "hi" });
		expect(await activities.modelStep({ ...ref, step: 0 })).toEqual({
			toolCalls: [],
		});
		expect(model.contexts[0]?.tools).toEqual([]);
		expect(model.contexts[0]?.systemPrompt).toContain("no workspace");
	});

	test("a turn that lost its workspace access still settles as failed", async () => {
		const { activities, settled, memory, turn } = setup([]);
		turn.running = false;
		await activities.settleTurn({
			...ref,
			outcome: "failed",
			errorMessage: "Agent may not use this workspace.",
			steersConsumed: 0,
		});
		expect(settled[0]).toMatchObject({
			status: "failed",
			errorCode: "Agent may not use this workspace.",
		});
		expect(memory.appends.at(-1)?.turnEnd?.status).toBe("failed");
	});

	test("in a room, the reply is posted once when the model did not post it", async () => {
		const room = {
			...credentials,
			room: { channelId: "c1", threadRootId: null },
		};
		const { activities, model, posts } = setup(
			[assistant([{ type: "text", text: "All good." }])],
			room,
		);
		await activities.beginTurn({ ...ref, promptId: "p1", text: "status?" });
		await activities.modelStep({ ...ref, step: 0 });
		const offered = (model.contexts[0]?.tools ?? []) as Array<{ name: string }>;
		expect(offered.map((tool) => tool.name)).toContain("post_message");
		expect(model.contexts[0]?.systemPrompt).toContain("post_message");
		await activities.settleTurn({
			...ref,
			outcome: "completed",
			steersConsumed: 0,
		});
		expect(posts).toEqual([{ body: "All good.", idempotencyKey: "t1:reply" }]);
	});

	test("in a room, a turn that posted is not posted again", async () => {
		const room = {
			...credentials,
			room: { channelId: "c1", threadRootId: null },
		};
		const { activities, posts } = setup(
			[
				assistant([
					{
						type: "toolCall",
						id: "c1",
						name: "post_message",
						arguments: { body: "Done." },
					},
				]),
				assistant([{ type: "text", text: "Posted the answer." }]),
			],
			room,
		);
		await activities.beginTurn({ ...ref, promptId: "p1", text: "status?" });
		await activities.modelStep({ ...ref, step: 0 });
		await activities.toolStep({ ...ref, step: 0, toolCallId: "c1" });
		await activities.modelStep({ ...ref, step: 1 });
		await activities.settleTurn({
			...ref,
			outcome: "completed",
			steersConsumed: 0,
		});
		expect(posts).toEqual([{ body: "Done.", idempotencyKey: "c1" }]);
	});
});
