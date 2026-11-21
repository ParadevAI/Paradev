import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SteerInput } from "@superset/agent-harness/session/definitions";
import {
	ActivityCancellationDetails,
	ApplicationFailure,
	CancelledFailure,
} from "@temporalio/common";
import { MockActivityEnvironment } from "@temporalio/testing";
import type { TurnCredentials } from "../../clients/credentials";
import type {
	AppendInput,
	SessionStore,
	TranscriptRow,
} from "../../clients/sessionStore";
import type { SettleTurnInput } from "../../clients/settler";
import { createActivities } from "./createActivities";

const FAKE_PDEV = join(import.meta.dir, "../../../test/fakePdev.ts");

const withBox: TurnCredentials = {
	sessionStore: { baseUrl: "http://store", writeTicket: "t" },
	host: { url: "http://host", bearer: "box-secret", workspaceId: "w1" },
	model: {
		baseUrl: "http://router",
		modelId: "",
		headers: { "x-superset-sandbox-credential": "c" },
	},
};

function memoryStore() {
	const appends: AppendInput[] = [];
	const rows: TranscriptRow[] = [];
	const store: SessionStore = {
		async append(input) {
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
			return [...rows];
		},
		async transcriptStep(stepKey) {
			return rows.filter((row) => row.stepKey === stepKey);
		},
	};
	return { store, appends, rows };
}

let root: string;
let logFile: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "agent-worker-"));
	logFile = join(root, "pdev.log");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

interface PdevLogEntry {
	event?: string;
	method?: string;
	params?: { prompt: Array<{ text: string }> };
	entries?: number;
	env: Record<string, string | undefined>;
	settings: string;
	appendSystem: string | null;
	mcp: string | null;
}

function pdevLog(): PdevLogEntry[] {
	try {
		return readFileSync(logFile, "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
	} catch {
		return [];
	}
}

const prompts = () =>
	pdevLog()
		.filter((e) => e.method === "session/prompt")
		.map((e) => e.params?.prompt[0]?.text ?? "");

function setup(
	options: {
		credentials?: TurnCredentials;
		steers?: () => SteerInput[];
		model?: string;
		mainModel?: string;
	} = {},
) {
	const memory = memoryStore();
	const settled: SettleTurnInput[] = [];
	const retries: Array<{ turnId: string; attempt: number; error: string }> = [];
	const posted: Array<{ body: string; idempotencyKey: string }> = [];
	const activities = createActivities({
		credentials: {
			forTurn: async () => options.credentials ?? withBox,
		},
		settler: {
			async noteRetry(input) {
				retries.push(input);
			},
			async settle(input) {
				settled.push(input);
				return {
					steerPending: false,
					sessionStore: { baseUrl: "http://store", writeTicket: "t" },
				};
			},
		},
		pdev: {
			command: FAKE_PDEV,
			workRoot: join(root, "sessions"),
			...(options.model ? { model: options.model } : {}),
			...(options.mainModel ? { mainModel: options.mainModel } : {}),
			env: { FAKE_PDEV_LOG: logFile },
		},
		turnSteers: async () => options.steers?.() ?? [],
		sessionStore: () => memory.store,
		workspaceContext: async () => ({ cwd: "/workspace" }),
		roomPoster: () => ({
			async post(input) {
				posted.push(input);
				return {};
			},
		}),
		flushEveryMs: 0,
		pollEveryMs: 20,
		settleIdleMs: 30,
		heartbeatEveryMs: 1_000,
	});
	return { activities, memory, settled, posted, retries };
}

const turn = { sessionId: "s1", turnId: "t1" };

async function runOne(
	activities: ReturnType<typeof setup>["activities"],
	text: string,
	turnId = "t1",
	env = new MockActivityEnvironment(),
) {
	await activities.beginTurn({
		sessionId: "s1",
		turnId,
		promptId: `p-${turnId}`,
		text,
	});
	return (await env.run(activities.runTurn, {
		sessionId: "s1",
		turnId,
		prompts: [{ promptId: `p-${turnId}`, text }],
		steersFrom: 0,
	})) as { steersConsumed: number };
}

describe("runTurn", () => {
	test("runs pdev on the box, streams its updates and saves its session", async () => {
		const { activities, memory } = setup({ model: "pdev/auto" });
		const ran = await runOne(activities, "hello");
		expect(ran.steersConsumed).toBe(0);

		const start = pdevLog().find((e) => e.event === "start");
		expect(start?.env).toMatchObject({
			PDEV_REMOTE_HOST_URL: "http://host",
			PDEV_REMOTE_HOST_TOKEN: "box-secret",
			PDEV_REMOTE_WORKSPACE_ID: "w1",
			PDEV_REMOTE_CWD: "/workspace",
			PDEV_GATEWAY_URL: "http://router",
			PDEV_GATEWAY_HEADERS: JSON.stringify(withBox.model.headers),
			PDEV_SUPERSET: "0",
		});
		expect(start?.env.PDEV_NO_WORKSPACE).toBeUndefined();
		expect(JSON.parse(start?.settings ?? "null")).toEqual({
			defaultProvider: "pdev",
			defaultModel: "auto",
		});

		const updates = memory.appends.flatMap((a) => a.acp ?? []);
		expect(
			updates.map((u) => (u as { sessionUpdate: string }).sessionUpdate),
		).toContain("agent_message_chunk");
		expect(
			updates.filter(
				(u) =>
					(u as { sessionUpdate: string }).sessionUpdate === "user_message",
			),
		).toHaveLength(1);
		expect(memory.rows.some((row) => row.stepKey === "pdev/file")).toBe(true);
		expect(
			memory.rows.filter((row) => row.stepKey.startsWith("pdev/lines/")).length,
		).toBeGreaterThan(0);
	});

	test("a session with no box runs pdev with no workspace", async () => {
		const { activities } = setup({
			credentials: {
				...withBox,
				host: null,
				room: { channelId: "c1", threadRootId: null },
			},
		});
		await runOne(activities, "hello");
		const start = pdevLog().find((e) => e.event === "start");
		expect(start?.env.PDEV_NO_WORKSPACE).toBe("1");
		expect(start?.env.PDEV_REMOTE_HOST_URL).toBeUndefined();
		expect(start?.appendSystem).toContain("final reply");
	});

	test("the next turn resumes the saved session", async () => {
		const { activities } = setup();
		await runOne(activities, "first", "t1");
		await runOne(activities, "second", "t2");
		const resume = pdevLog().filter((e) => e.method === "session/resume");
		expect(resume).toHaveLength(1);
		expect(pdevLog().find((e) => e.event === "resumed")?.entries).toBe(3);
		expect(prompts()).toEqual(["first", "second"]);
	});

	test("a retried attempt resumes and does not send the prompt again", async () => {
		const { activities, memory } = setup();
		await activities.beginTurn({
			...turn,
			promptId: "p1",
			text: "crash please",
		});
		const input = {
			...turn,
			prompts: [{ promptId: "p1", text: "crash please" }],
			steersFrom: 0,
		};
		await expect(
			new MockActivityEnvironment().run(activities.runTurn, input),
		).rejects.toThrow("pdev exited");
		expect(
			memory.rows.some((row) => row.stepKey.startsWith("pdev/lines/")),
		).toBe(true);

		await new MockActivityEnvironment({ attempt: 2 }).run(
			activities.runTurn,
			input,
		);
		expect(prompts().at(-1)).toContain("stopped before it finished");
		expect(prompts().at(-1)).not.toContain("crash please");
	});

	test("a retry sends only what the crashed attempt did not, in order", async () => {
		const { activities } = setup();
		await activities.beginTurn({
			...turn,
			promptId: "p1",
			text: "crash please",
		});
		const input = {
			...turn,
			prompts: [
				{ promptId: "p1", text: "crash please" },
				{ promptId: "p2", text: "also this", steer: true },
			],
			steersFrom: 1,
		};
		await expect(
			new MockActivityEnvironment().run(activities.runTurn, input),
		).rejects.toThrow();
		expect(prompts()).toEqual(["crash please"]);
		await new MockActivityEnvironment({ attempt: 2 }).run(
			activities.runTurn,
			input,
		);
		expect(prompts().slice(1, 2)[0]).toContain("stopped before it finished");
		expect(prompts().slice(2)).toEqual(["also this"]);
	});

	test("sends two messages with the same text as two messages", async () => {
		const { activities } = setup();
		await activities.beginTurn({ ...turn, promptId: "p1", text: "yes" });
		await new MockActivityEnvironment().run(activities.runTurn, {
			...turn,
			prompts: [
				{ promptId: "p1", text: "yes" },
				{ promptId: "p2", text: "yes", steer: true },
			],
			steersFrom: 1,
		});
		expect(prompts()).toEqual(["yes", "yes"]);
	});

	test("passes steers to pdev as they arrive, once each", async () => {
		const steers: SteerInput[] = [];
		const { activities, memory } = setup({ steers: () => steers });
		await activities.beginTurn({ ...turn, promptId: "p1", text: "hang on" });
		const env = new MockActivityEnvironment();
		const running = env.run(activities.runTurn, {
			...turn,
			prompts: [{ promptId: "p1", text: "hang on" }],
			steersFrom: 0,
		});
		for (let i = 0; i < 100 && !prompts().length; i++) await Bun.sleep(20);
		steers.push({ turnId: "t1", promptId: "p2", text: "also this" });
		for (let i = 0; i < 100 && prompts().length < 2; i++) await Bun.sleep(20);
		env.cancel();
		await expect(running).rejects.toBeInstanceOf(CancelledFailure);
		expect(prompts()).toEqual(["hang on", "also this"]);
		expect(memory.appends.some((a) => a.stepKey === "steer/p2")).toBe(true);
		expect(pdevLog().some((e) => e.method === "session/cancel")).toBe(true);
	});
	test("waits for a subagent pdev started, and ignores the subagent's own session", async () => {
		const { activities, settled } = setup();
		await runOne(activities, "use a subagent");
		await activities.settleTurn({
			...turn,
			outcome: "completed",
			steersConsumed: 0,
		});
		expect(settled[0]?.reply).toBe("subagent finished");
	});
	test("a worker shutdown fails the attempt for a retry, without stopping the turn", async () => {
		const { activities } = setup();
		await activities.beginTurn({ ...turn, promptId: "p1", text: "hang on" });
		const env = new MockActivityEnvironment();
		const running = env.run(activities.runTurn, {
			...turn,
			prompts: [{ promptId: "p1", text: "hang on" }],
			steersFrom: 0,
		});
		for (let i = 0; i < 100 && !prompts().length; i++) await Bun.sleep(20);
		env.cancel(
			"WORKER_SHUTDOWN",
			new ActivityCancellationDetails({ workerShutdown: true }),
		);
		const error = await running.catch((e: unknown) => e);
		expect(error).toBeInstanceOf(ApplicationFailure);
		expect((error as ApplicationFailure).nonRetryable).toBe(false);
		expect(pdevLog().some((e) => e.method === "session/cancel")).toBe(false);
	});
	test("a provider error fails the attempt for a retry; a bad request fails the turn", async () => {
		const { activities, retries } = setup();
		const attempt = async (text: string) => {
			await activities.beginTurn({ ...turn, promptId: text, text });
			const error = await new MockActivityEnvironment()
				.run(activities.runTurn, {
					...turn,
					prompts: [{ promptId: text, text }],
					steersFrom: 0,
				})
				.catch((e: unknown) => e);
			expect(error).toBeInstanceOf(ApplicationFailure);
			return error as ApplicationFailure;
		};
		const outage = await attempt("model error: 529 overloaded");
		expect(outage.nonRetryable).toBe(false);
		expect(outage.message).toBe("529 overloaded");
		const bad = await attempt("model error: 400 invalid_request_error");
		expect(bad.nonRetryable).toBe(true);
		expect(retries).toEqual([
			{ turnId: "t1", attempt: 1, error: "529 overloaded" },
		]);
	});
	test("a main session gets the Dev's prompt and its tools, and no machine", async () => {
		const { activities } = setup({
			credentials: {
				...withBox,
				host: null,
				dev: { name: "Ada", description: "backend", instructions: "Be brief." },
				session: { kind: "main", role: null, title: null },
				tools: { mcpUrl: "http://api/mcp/agent" },
				agentToken: "turn-token",
			},
			model: "pdev/auto",
			mainModel: "vercel-ai-gateway/anthropic/claude-haiku-5-5",
		});
		await runOne(activities, "hello");
		const start = pdevLog().find((e) => e.event === "start");
		expect(start?.env.PDEV_NO_WORKSPACE).toBe("1");
		expect(
			pdevLog().find((e) => e.method === "session/set_config_option")?.params,
		).toMatchObject({
			configId: "model",
			value: "vercel-ai-gateway/anthropic/claude-haiku-5-5",
		});
		expect(start?.appendSystem).toContain("You are Ada");
		expect(start?.appendSystem).toContain("Be brief.");
		const mcp = JSON.parse(start?.mcp ?? "{}");
		expect(mcp.mcpServers.dev.url).toBe("http://api/mcp/agent");
		expect(mcp.mcpServers.dev.headersHelper).toContain(
			"dev-tools-headers.json",
		);
	});
});

describe("settleTurn", () => {
	test("reports the reply and cost from pdev's session, and posts the reply in the room", async () => {
		const { activities, settled, posted } = setup({
			credentials: {
				...withBox,
				room: { channelId: "c1", threadRootId: null },
			},
		});
		await runOne(activities, "hello");
		await activities.settleTurn({
			...turn,
			outcome: "completed",
			steersConsumed: 0,
		});
		expect(settled[0]).toMatchObject({
			status: "completed",
			reply: "reply to: hello",
			inputTokens: 12,
			outputTokens: 5,
			costMicrosUsd: 2000,
		});
		expect(posted).toEqual([
			{ body: "reply to: hello", idempotencyKey: "t1:reply" },
		]);
	});

	test("does not post the final reply again when the Dev replied with its tool", async () => {
		const { activities, posted } = setup({
			credentials: {
				...withBox,
				room: { channelId: "c1", threadRootId: null },
			},
		});
		await runOne(activities, "please use the reply tool");
		await activities.settleTurn({
			...turn,
			outcome: "completed",
			steersConsumed: 0,
		});
		expect(posted).toEqual([]);
	});

	test("counts only this turn and closes calls a stop left open", async () => {
		const { activities, settled, memory } = setup();
		await runOne(activities, "first", "t1");
		await activities.beginTurn({
			...turn,
			turnId: "t2",
			promptId: "p2",
			text: "hang",
		});
		const env = new MockActivityEnvironment();
		const running = env.run(activities.runTurn, {
			...turn,
			turnId: "t2",
			prompts: [{ promptId: "p2", text: "hang" }],
			steersFrom: 0,
		});
		for (let i = 0; i < 100 && prompts().length < 2; i++) await Bun.sleep(20);
		env.cancel();
		await running.catch(() => {});
		await activities.settleTurn({
			...turn,
			turnId: "t2",
			outcome: "interrupted",
			steersConsumed: 0,
		});
		expect(settled[0]).toMatchObject({
			status: "interrupted",
			costMicrosUsd: 1000,
		});
		const end = memory.appends.find((a) => a.stepKey === "t2/end");
		expect(
			end?.acp?.some(
				(u) => (u as { toolCallId?: string }).toolCallId === "call_1",
			),
		).toBe(true);
	});
});
