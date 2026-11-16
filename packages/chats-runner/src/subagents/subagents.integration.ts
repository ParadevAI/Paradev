import { afterAll, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import {
	type AssistantMessage,
	type FauxResponseStep,
	fauxAssistantMessage,
	fauxProvider,
	fauxText,
	fauxToolCall,
	getSystemMessageText,
} from "@earendil-works/pi-ai";
import {
	type ExtensionAPI,
	ModelRuntime,
	type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { createBackgroundHost } from "../background/background.ts";
import {
	createSubagents,
	type RunInfo,
	type SubagentOptions,
} from "./subagents.ts";

const root = mkdtempSync(join(tmpdir(), "subagents-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

type FauxContext = Parameters<
	Extract<FauxResponseStep, (...args: never[]) => unknown>
>[0];
const textOf = (content: unknown) =>
	typeof content === "string"
		? content
		: (content as { type: string; text?: string }[])
				.map((c) => c.text ?? "")
				.join("");

/** A model whose every answer `respond` scripts from the run's task, its system prompt and the tool results so far. */
function scripted(
	respond: (
		task: string,
		results: string[],
		system: string,
	) => AssistantMessage,
) {
	return async () => {
		const runtime = await ModelRuntime.create({
			authPath: join(root, "auth.json"),
			modelsPath: null,
			refreshOnCreate: false,
		});
		const faux = fauxProvider();
		const step: FauxResponseStep = (context: FauxContext) => {
			faux.appendResponses([step]);
			const task = textOf(
				context.messages.find((m) => m.role === "user")!.content,
			);
			const results = context.messages.flatMap((m) =>
				m.role === "toolResult" ? [textOf(m.content)] : [],
			);
			// The system prompt reaches the model as the transcript's system messages.
			const system = context.messages
				.flatMap((m) => (m.role === "system" ? [getSystemMessageText(m)] : []))
				.join("\n");
			return respond(task, results, system);
		};
		faux.setResponses([step]);
		runtime.registerNativeProvider(faux.provider);
		return { runtime, model: faux.getModel() };
	};
}

let dirs = 0;

function setup(
	overrides: Partial<SubagentOptions> = {},
	agentDir = join(root, `agent-${++dirs}`),
) {
	const updates: SessionUpdate[] = [];
	const turn = new AbortController();
	const tools = new Map<string, ToolDefinition>();
	const notices: { chatId: string; text: string }[] = [];
	const host = createBackgroundHost({
		agentDir,
		deliver: async (chatId, text) => void notices.push({ chatId, text }),
	});
	const options: SubagentOptions = {
		agentDir,
		chatId: "g1",
		apiUrl: "http://127.0.0.1:9",
		host,
		model: scripted((task) => fauxAssistantMessage(`Result for ${task}`)),
		turnEnv: () => ({ DEV_GROUP_ID: "g1" }),
		plugins: () => [],
		turnSignal: () => turn.signal,
		emit: (u) => updates.push(u),
		...overrides,
	};
	const subagents = createSubagents(options);
	subagents.extension({
		registerTool: (t: ToolDefinition) => void tools.set(t.name, t),
	} as unknown as ExtensionAPI);
	type Result = {
		content: { type: "text"; text: string }[];
		details: { agentId: string; status: string };
	};
	const call = (
		name: string,
		params: Record<string, unknown>,
		id = "call1",
		signal?: AbortSignal,
	) =>
		tools
			.get(name)!
			.execute(
				id,
				params as never,
				signal,
				undefined,
				{} as never,
			) as Promise<Result>;
	const agent = (params: Record<string, unknown>, id = "call1") =>
		call("agent", { description: "a job", ...params }, id);
	const text = (r: { content: { text: string }[] }) => r.content[0]!.text;
	/** Each run's last announced state. */
	const runs = () => {
		const latest = new Map<string, RunInfo>();
		for (const u of updates) {
			const run = u._meta?.["dev/subagentRun"] as RunInfo | undefined;
			if (run) latest.set(run.id, run);
		}
		return [...latest.values()];
	};
	const nested = (run: string) =>
		updates.filter(
			(u) =>
				(u._meta?.["dev/subagent"] as { run?: string } | undefined)?.run ===
				run,
		);
	const untilNotices = async (n: number) => {
		while (notices.length < n) await new Promise((r) => setTimeout(r, 5));
	};
	return {
		agentDir,
		updates,
		get turn() {
			return turn;
		},
		tools,
		call,
		agent,
		text,
		runs,
		nested,
		notices,
		untilNotices,
		host,
		subagents,
	};
}

/** A model that answers once `release` is called, so tests can hold a run. */
function held(answer: (task: string, history: string[]) => string) {
	let open!: () => void;
	const gate = new Promise<void>((r) => (open = r));
	const histories: string[][] = [];
	const model = async () => {
		const runtime = await ModelRuntime.create({
			authPath: join(root, "auth.json"),
			modelsPath: null,
			refreshOnCreate: false,
		});
		const faux = fauxProvider();
		const step: FauxResponseStep = async (context: FauxContext) => {
			faux.appendResponses([step]);
			await gate;
			const users = context.messages.flatMap((m) =>
				m.role === "user" ? [textOf(m.content)] : [],
			);
			histories.push(users);
			return fauxAssistantMessage(answer(users.at(-1) ?? "", users));
		};
		faux.setResponses([step]);
		runtime.registerNativeProvider(faux.provider);
		return { runtime, model: faux.getModel() };
	};
	return { model, histories, release: () => open() };
}

const working = async (s: ReturnType<typeof setup>, n = 1) => {
	while (s.runs().filter((r) => r.status === "in_progress").length < n)
		await new Promise((r) => setTimeout(r, 5));
};

describe("an agent's connected apps", () => {
	const LINEAR = {
		name: "composio-linear",
		displayName: "Linear",
		description: "Act in the owner's Linear.",
		accounts: ["Superset workspace"],
	};

	/** A tiny MCP server with one tool, like the API's credential proxy. */
	function fakeApp() {
		return Bun.serve({
			port: 0,
			async fetch(req) {
				if (req.method !== "POST") return new Response(null, { status: 405 });
				const message = (await req.json()) as {
					id?: number;
					method: string;
					params?: { arguments?: unknown };
				};
				if (message.id === undefined)
					return new Response(null, { status: 202 });
				const answer = (result: unknown) =>
					Response.json(
						{ jsonrpc: "2.0", id: message.id, result },
						{ headers: { "mcp-session-id": "s-1" } },
					);
				if (message.method === "initialize")
					return answer({
						protocolVersion: "2025-06-18",
						capabilities: { tools: {} },
						serverInfo: { name: "proxy", version: "1" },
					});
				if (message.method === "tools/list")
					return answer({
						tools: [
							{
								name: "LINEAR_LIST_ISSUES",
								description: "Lists Linear issues",
								inputSchema: { type: "object", properties: {} },
							},
						],
					});
				if (message.method === "tools/call")
					return answer({ content: [{ type: "text", text: "3 open issues" }] });
				return answer({});
			},
		});
	}

	test("finds a deferred app tool with tool_search and calls it, knowing which apps are connected", async () => {
		const api = fakeApp();
		try {
			const agentDir = join(root, `agent-${++dirs}`);
			mkdirSync(agentDir, { recursive: true });
			// As the server writes it: every connected app is deferred.
			writeFileSync(
				join(agentDir, "mcp.json"),
				JSON.stringify({
					mcpServers: {
						"composio-linear": {
							url: `http://127.0.0.1:${api.port}/mcp`,
							exposure: "deferred",
							description: "Linear",
						},
					},
				}),
			);
			const systems: string[] = [];
			const model = scripted((_task, results, system) => {
				systems.push(system);
				if (!results.length)
					return fauxAssistantMessage([
						fauxToolCall("tool_search", { query: "linear issues" }),
					]);
				if (results.length === 1)
					return fauxAssistantMessage([
						fauxToolCall("mcp__composio_linear__LINEAR_LIST_ISSUES", {}),
					]);
				return fauxAssistantMessage(`Linear says: ${results.at(-1)}`);
			});
			const s = setup({ model, plugins: () => [LINEAR] }, agentDir);
			const result = await s.agent({
				prompt: "what's open in Linear?",
				run_in_background: false,
			});
			expect(s.text(result)).toContain("Linear says: 3 open issues");
			expect(systems[0]).toContain("## Your connected apps");
		} finally {
			api.stop(true);
		}
	}, 30_000);
});

describe("the agent tool, kept in the turn", () => {
	test("runs on its role prompt alone, streams its work nested under the call, and returns its result with how to follow up", async () => {
		let system = "";
		const s = setup({
			model: scripted((task, results, prompt) => {
				system = prompt;
				if (results.length === 0)
					return fauxAssistantMessage(
						[
							fauxText("Checking the folder."),
							fauxToolCall("bash", { command: "echo $DEV_GROUP_ID" }),
						],
						{ stopReason: "toolUse" },
					);
				return fauxAssistantMessage(
					`Plan for ${task.slice("Task: ".length)}: chat ${results[0]!.trim()}.`,
				);
			}),
		});
		const result = await s.agent({
			prompt: "Lisbon, 3 days",
			run_in_background: false,
		});
		const id = result.details.agentId;
		expect(result.details.status).toBe("completed");
		expect(s.text(result)).toStartWith(
			"Plan for Lisbon, 3 days: chat g1.\n\n(agent ",
		);
		expect(s.text(result)).toContain("`send_message` to it for a follow-up");
		expect(system).toStartWith("You are a subagent of a Dev");
		expect(system).not.toContain("How Dev works");
		const run = `call1-${id}`;
		expect(s.runs()).toMatchObject([
			{
				id: run,
				agent: "agent",
				task: "Lisbon, 3 days",
				status: "completed",
				model: "faux-1",
				error: null,
			},
		]);
		expect(s.nested(run).map((u) => u.sessionUpdate)).toEqual([
			"agent_message_chunk",
			"tool_call",
			"tool_call_update",
			"agent_message_chunk",
		]);
		expect(s.nested(run)[1]).toMatchObject({
			toolCallId: expect.stringMatching(new RegExp(`^${run}/`)),
			title: expect.stringContaining("echo"),
			_meta: { "dev/subagent": { parent: "call1", run } },
		});
		// A run kept in the turn brings no notice.
		expect(s.notices).toEqual([]);
	});

	test("works in the Dev's folder with bash and the file tools, not a sandbox", async () => {
		const s = setup({
			model: scripted((_task, results) => {
				if (results.length === 0)
					return fauxAssistantMessage(
						[fauxToolCall("write", { path: "notes/out.txt", content: "done" })],
						{ stopReason: "toolUse" },
					);
				if (results.length === 1)
					return fauxAssistantMessage(
						[fauxToolCall("bash", { command: "cat notes/out.txt" })],
						{ stopReason: "toolUse" },
					);
				return fauxAssistantMessage(`read: ${results[1]}`);
			}),
		});
		const result = await s.agent({
			prompt: "write a note",
			run_in_background: false,
		});
		expect(s.text(result)).toContain("read: done");
		expect(readFileSync(join(s.agentDir, "notes", "out.txt"), "utf8")).toBe(
			"done",
		);
	});

	test.each([
		"reply",
		"send_update",
		"question",
		"agent",
		"sketch",
	])("has no %s tool: it never speaks in the chat, asks or starts more agents", async (name) => {
		const s = setup({
			model: scripted((_task, results) =>
				results.length === 0
					? fauxAssistantMessage([fauxToolCall(name, { text: "hi" })], {
							stopReason: "toolUse",
						})
					: fauxAssistantMessage(`got: ${results[0]}`),
			),
		});
		const result = await s.agent({ prompt: "x", run_in_background: false });
		expect(s.text(result)).toMatch(
			/got: .*(not found|unknown|No tool|not available)/i,
		);
	});

	test("without a chat's own turn (an ask, a trigger's) it stays in the turn even when asked for the background", async () => {
		const s = setup({ canBackground: () => false });
		const result = await s.agent({ prompt: "x" });
		expect(s.text(result)).toStartWith("Result for Task: x");
		expect(s.host.busy()).toBe(false);
	});

	test("stops one that goes on past its steps", async () => {
		const s = setup({
			limits: { steps: 2 },
			model: scripted(() =>
				fauxAssistantMessage([fauxToolCall("ls", {})], {
					stopReason: "toolUse",
				}),
			),
		});
		await expect(s.agent({ prompt: "Review forever" })).rejects.toThrow(
			"Failed: Stopped after 2 steps",
		);
	});

	test("cancelling the turn stops it", async () => {
		const m = held(() => "never");
		const s = setup({ model: m.model });
		const call = s.agent({ prompt: "a" });
		await working(s);
		s.turn.abort();
		m.release();
		await expect(call).rejects.toThrow("Stopped: the turn was cancelled");
	});

	test("refuses calls it can't run", async () => {
		const s = setup();
		await expect(s.agent({ prompt: "  " })).rejects.toThrow("needs a prompt");
		await expect(s.agent({ prompt: "x", name: "1bad name" })).rejects.toThrow(
			"A name is letters",
		);
		expect(s.updates).toEqual([]);
	});
});

describe("agents in the background, Claude Code's way", () => {
	test("by default it works in the background: its id at once, then a notice with its result", async () => {
		const m = held((task) => `Cheapest: the 12th (${task})`);
		const s = setup({ model: m.model, canBackground: () => true });
		const result = await s.agent({
			description: "flights to Goa",
			prompt: "find the cheapest flights to Goa",
			name: "flights",
		});
		const id = result.details.agentId;
		expect(result.details.status).toBe("async_launched");
		expect(s.text(result)).toStartWith(
			`Agent flights (${id}) is working in the background. You'll get a notice when it ends`,
		);
		expect(s.host.busy()).toBe(true);
		// The turn ends (a newer message cancels it, say): the agent keeps working.
		s.turn.abort();
		m.release();
		await s.untilNotices(1);
		expect(s.notices[0]!.chatId).toBe("g1");
		expect(s.notices[0]!.text).toContain(
			`<task-id>${id}</task-id>\n<task-type>agent</task-type>\n<status>completed</status>\n<summary>Agent "flights to Goa" finished</summary>`,
		);
		expect(s.notices[0]!.text).toContain(
			"<result>Cheapest: the 12th (Task: find the cheapest flights to Goa)</result>",
		);
		expect(s.host.busy()).toBe(false);
	});

	test("one kept in the turn moves to the background by itself when it takes too long, and the turn no longer stops it", async () => {
		const m = held(() => "Done slowly");
		const s = setup({
			model: m.model,
			canBackground: () => true,
			limits: { autoBackgroundMs: 40 },
		});
		const result = await s.agent({
			prompt: "a long draft",
			run_in_background: false,
		});
		expect(s.text(result)).toMatch(
			/^This took over 0 s, so agent agt-[0-9a-f]+ moved to the background and keeps working\./,
		);
		s.turn.abort();
		m.release();
		await s.untilNotices(1);
		expect(s.notices[0]!.text).toContain("<result>Done slowly</result>");
	});

	test("send_message reaches a working agent before its next step, and gives a finished one its next task with what it did", async () => {
		const m = held((_task, history) => history.join(" | "));
		const s = setup({ model: m.model, canBackground: () => true });
		await s.agent({ prompt: "hotels in Goa", name: "hotels" });
		await working(s);
		expect(
			s.text(
				await s.call("send_message", {
					to: "hotels",
					message: "Only by the beach",
				}),
			),
		).toMatch(/^Message queued for hotels \(agt-[0-9a-f]+\)/);
		m.release();
		await s.untilNotices(1);
		expect(s.notices[0]!.text).toContain("Only by the beach");

		const again = await s.call(
			"send_message",
			{ to: "hotels", message: "Now under €100" },
			"call2",
		);
		expect(s.text(again)).toContain(
			"picked it up and is working in the background",
		);
		await s.untilNotices(2);
		expect(m.histories.at(-1)).toEqual([
			"Task: hotels in Goa",
			"Only by the beach",
			"Now under €100",
		]);
		await expect(
			s.call("send_message", { to: "nope", message: "hi" }),
		).rejects.toThrow("No agent nope");
	});

	test("stopping one (task_stop, through the box's host) sends no notice; list_agents shows where each stands", async () => {
		const m = held(() => "never");
		const s = setup({ model: m.model, canBackground: () => true });
		const id = (
			await s.agent({ description: "plan the week", prompt: "plan the week" })
		).details.agentId;
		await working(s);
		expect(s.text(await s.call("list_agents", {}))).toMatch(
			new RegExp(
				`^- ${id} · working in the background · started \\d+ s ago · plan the week$`,
			),
		);
		expect(s.host.stop(id)).toEqual({ said: undefined });
		m.release();
		while (s.host.busy()) await new Promise((r) => setTimeout(r, 5));
		expect(s.notices).toEqual([]);
		expect(s.text(await s.call("list_agents", {}))).toContain(
			`${id} · stopped`,
		);
		expect(s.host.stop(id)).toBeUndefined();
	});

	test("a box that wakes after the last went away tells the chat what didn't finish, and the agent can be picked up again", async () => {
		const m = held(() => "never");
		const first = setup({ model: m.model, canBackground: () => true });
		const id = (
			await first.agent({
				description: "itinerary",
				prompt: "draft the itinerary",
				name: "itin",
			})
		).details.agentId;
		await working(first);
		// The box goes away mid-run; a new one starts on the same folder.
		const notices: string[] = [];
		const host = createBackgroundHost({
			agentDir: first.agentDir,
			deliver: async (_chat, text) => void notices.push(text),
		});
		await host.ready;
		expect(notices).toHaveLength(1);
		expect(notices[0]).toContain(`<task-id>${id}</task-id>`);
		expect(notices[0]).toContain("<status>lost</status>");
		expect(notices[0]).toContain(
			'<summary>Agent "itinerary" didn&apos;t finish'.replace("&apos;", "'"),
		);
		expect(host.get(id)).toMatchObject({ status: "lost", name: "itin" });
		m.release();
	});

	test("a deleted chat (the host's stopChat) stops every working agent, with no notice", async () => {
		const m = held(() => "never");
		const s = setup({ model: m.model, canBackground: () => true });
		await s.agent({ prompt: "a" });
		await s.agent({ prompt: "b" }, "call2");
		await working(s, 2);
		s.host.stopChat("g1");
		m.release();
		while (s.host.busy()) await new Promise((r) => setTimeout(r, 5));
		expect(s.notices).toEqual([]);
	});

	test("at most `background` agents in the background on the box; one more is refused", async () => {
		const m = held(() => "x");
		const s = setup({
			model: m.model,
			canBackground: () => true,
			limits: { background: 1 },
		});
		await s.agent({ prompt: "a" });
		await expect(s.agent({ prompt: "b" }, "call2")).rejects.toThrow(
			"Don't retry",
		);
		m.release();
	});
});
