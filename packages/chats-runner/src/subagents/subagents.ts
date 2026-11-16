import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import {
	type AgentSession,
	createAgentSession,
	createToolSearchExtension,
	type ExtensionAPI,
	SessionManager,
	SettingsManager,
	type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { BackgroundHost } from "../background/background.ts";
import { backgroundTools } from "../background-tools/background-tools.ts";
import type { SessionModel } from "../model/model.ts";
import { toAcpUpdates } from "../pi/event-map.ts";
import { PromptLoader } from "../pi/prompt-loader.ts";
import {
	createSessionMcp,
	pluginsPrompt,
	type TurnPlugin,
} from "../plugins/plugins.ts";
import { SUBAGENT_META } from "../turn-trace/turn-trace.ts";

export interface SubagentLimits {
	/** Agents running at once in a chat; more wait for a free slot. */
	concurrent: number;
	/** Agents running in the background at once on the box; one more is refused (Claude Code allows 20 in its own machine). */
	background: number;
	/** Model calls one run may make before it's stopped, kept in the turn or in the background. */
	steps: number;
	backgroundSteps: number;
	/** How long one run may take before it's stopped, kept in the turn or in the background. */
	timeMs: number;
	backgroundTimeMs: number;
	/** How long a run kept in the turn waits before it moves to the background by itself (Claude Code: 120 s). */
	autoBackgroundMs: number;
	/** Finished agents kept per chat to be messaged again (`send_message`); older ones are forgotten with their sessions. */
	keep: number;
}

/** A turn may run 30 minutes; agents kept in it must fit with the Dev's own work. */
export const DEFAULT_LIMITS: SubagentLimits = {
	concurrent: 3,
	background: 6,
	steps: 25,
	backgroundSteps: 60,
	timeMs: 8 * 60_000,
	backgroundTimeMs: 25 * 60_000,
	autoBackgroundMs: 2 * 60_000,
	keep: 12,
};

/** What one agent's result may put in the Dev's context; anything longer is cut. */
const OUTPUT_MAX = 20_000;
/** A run's task as watchers and the trace see it. */
const TASK_MAX = 2_000;

/** `_meta` key on a `tool_call_update` of the `agent` tool: one run's state (packages/sync live-turn reads it). */
const RUN_META = "dev/subagentRun";

interface Usage {
	steps: number;
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
}

/** One agent run as watchers and the trace see it. */
export interface RunInfo {
	id: string;
	agent: string;
	task: string;
	status: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
	usage: Usage;
	model: string | null;
	error: string | null;
}

export interface SubagentOptions {
	agentDir: string;
	chatId: string;
	apiUrl: string;
	/** The box's background work: agents in the background are recorded there and notify through it. */
	host: BackgroundHost;
	/** A model for one run, through the API's `/model` proxy like the Dev's own: no key in the box. */
	model: () => Promise<SessionModel>;
	/** The running turn's env, for the `dev` tool. */
	turnEnv: () => Record<string, string>;
	/** The running turn's connected apps, for agents. */
	plugins: () => TurnPlugin[];
	/** Aborted when the running turn is cancelled. */
	turnSignal: () => AbortSignal;
	/** Whether the running turn may move work to the background (a chat's own turn: not an ask, a trigger's or a visitor's). */
	canBackground?: () => boolean;
	/** Puts the runs' updates in the turn's stream (and so its trace). */
	emit: (update: SessionUpdate) => void;
	limits?: Partial<SubagentLimits>;
}

/** Waits for one of `n` slots; a waiter whose signal aborts leaves the queue. */
function createSlots(n: number) {
	let free = n;
	const waiting: (() => void)[] = [];
	return {
		take(signal: AbortSignal): Promise<void> {
			if (signal.aborted) return Promise.reject(new Error("aborted"));
			if (free > 0) {
				free--;
				return Promise.resolve();
			}
			return new Promise((resolve, reject) => {
				const go = () => {
					signal.removeEventListener("abort", stop);
					resolve();
				};
				const stop = () => {
					waiting.splice(waiting.indexOf(go), 1);
					reject(new Error("aborted"));
				};
				waiting.push(go);
				signal.addEventListener("abort", stop, { once: true });
			});
		},
		give() {
			const next = waiting.shift();
			if (next) next();
			else free++;
		},
	};
}

const zeroUsage = (): Usage => ({
	steps: 0,
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	cost: 0,
});
const cut = (text: string, max: number) =>
	text.length > max
		? `${text.slice(0, max)}\n… (${text.length - max} more characters cut)`
		: text;
const seconds = (ms: number) =>
	ms < 90_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`;

const ROLE_PROMPT = `You are a subagent of a Dev (an AI member of a chat in the Dev messenger), given one part of its work. Nobody in the chat sees you: only your final message goes back to the Dev, which decides what to post, so don't post, reply or ask in the chat yourself. The task is all the context you get, so don't assume anything else was said; the Dev may send you more while you work, or later.

You work in the Dev's folder, /agent, with its tools: files, bash (the \`dev\` CLI is there too), and its connected apps' tools (\`mcp__composio_<app>__*\`, \`mcp__dev_<app>__*\`, its owner's MCP servers'), loaded with \`tool_search\`. Do the task completely, and only the task: change something in an app or a file when the task asks you to, never otherwise, and say what you changed. Don't read other chats' rules or sessions, and keep anything private to this chat. Say so rather than guessing when you lack a source, and never invent links or quotes. Finish with a short report the Dev can act on: what you did or found (and where it came from), and what you couldn't do.`;

/** A name the Dev can reach an agent by: short, plain, not an id's shape. */
const NAME = /^[a-z][a-z0-9_-]{0,63}$/i;

const AgentParams = Type.Object({
	description: Type.String({
		description:
			"A few words for what it does (3–5): people and its notice see this",
	}),
	prompt: Type.String({
		description:
			"The task, with all the context it needs: the request, constraints, names, file paths. It sees nothing else",
	}),
	run_in_background: Type.Optional(
		Type.Boolean({
			description:
				"Work in the background (the default): you get its id at once and a notice when it ends, so the chat isn't held. false only when your very next step needs the result",
		}),
	),
	name: Type.Optional(
		Type.String({
			description:
				"A name to reach it by with `send_message` and `task_stop` (letters, digits, - and _)",
		}),
	),
});

const SendParams = Type.Object({
	to: Type.String({ description: "The agent: its name or id" }),
	message: Type.String({
		description:
			"What to tell it: more context, a correction, or (when it has finished) its next task; it keeps everything it did",
	}),
	summary: Type.Optional(
		Type.String({ description: "A few words for what the message is about" }),
	),
});

const NoParams = Type.Object({});

/** An agent in this chat: its session stays (on disk, in the Dev's folder) so it can be messaged again. */
interface Agent {
	id: string;
	name?: string;
	description: string;
	info: RunInfo;
	session: AgentSession | null;
	/** The running run's stop; null while it's idle. */
	stop: AbortController | null;
	/** In the background: its end is a notice. */
	background: boolean;
	/** The Dev stopped it itself: its notice is skipped. */
	stoppedByDev: boolean;
	output: string;
}

type RunResult = { info: RunInfo; output: string; ms: number };

/** What the Dev reads of a run: its result, or why there's none. */
const resultText = ({ info, output }: Pick<RunResult, "info" | "output">) =>
	info.status === "completed"
		? cut(output || "(no output)", OUTPUT_MAX)
		: `${info.status === "cancelled" ? "Stopped" : `Failed: ${info.error}`}${output ? `\n\nWhat it had so far:\n${cut(output, OUTPUT_MAX)}` : ""}`;

/**
 * Dev's subagents, Claude Code's way. `agent` starts a subagent with its own fresh context (a short role prompt and the task, never
 * the Dev's prompt, chat or memory) and the Dev's own tools in its folder: files, bash, its connected apps; but no
 * `reply`, `send_update`, question or `agent` tool, so it never speaks in the chat itself. In a chat's own turn it runs in the background by default: the tool returns its id at once and the box
 * keeps it working after the turn; when it ends, a `<task-notification>` reaches the chat (into its running turn, else
 * as a turn of its own; see the background host). One kept in the turn moves there by itself after 2 minutes. Its
 * session is kept in the Dev's folder, so `send_message` can tell it more while it works (pi's steer) or give it its
 * next task after it ended, even after a wake; `list_agents` lists them, and `task_stop` (background-tools) stops one. Each run is an
 * in-process pi session on the same `/model` proxy; its updates stream nested under its call.
 */
export function createSubagents(opts: SubagentOptions) {
	const limits: SubagentLimits = { ...DEFAULT_LIMITS, ...opts.limits };
	const slots = createSlots(limits.concurrent);
	const sessionDir = join(opts.agentDir, ".dev", "agents", opts.chatId);
	const canBackground = opts.canBackground ?? (() => false);
	const { host } = opts;
	const agents = new Map<string, Agent>();

	async function open(agent: Agent) {
		const model = await opts.model();
		const mcp = createSessionMcp({
			agentDir: opts.agentDir,
			apiUrl: opts.apiUrl,
			chatId: opts.chatId,
		});
		const settingsManager = SettingsManager.inMemory();
		const loader = new PromptLoader(
			{
				cwd: opts.agentDir,
				agentDir: opts.agentDir,
				settingsManager,
				noExtensions: true,
				noSkills: true,
				noPromptTemplates: true,
				noThemes: true,
				noContextFiles: true,
				// Connected apps' servers are `deferred` (mcp.json): without tool search their tools are never offered to the model.
				extensionFactories: [...mcp.extensions, createToolSearchExtension()],
			},
			{
				preamble: () => ROLE_PROMPT,
				sections: () => pluginsPrompt(opts.plugins()),
			},
		);
		await loader.reload();
		// The Dev's own `bash` (each command with the turn's env), kept in the run: nothing of an agent's moves to the background.
		const bash = backgroundTools({
			agentDir: opts.agentDir,
			chatId: opts.chatId,
			host,
			turnEnv: opts.turnEnv,
			turnSignal: opts.turnSignal,
			canBackground: () => false,
		}).filter((t) => t.name === "bash");
		mkdirSync(sessionDir, { recursive: true });
		const existing = SessionManager.findById(
			opts.agentDir,
			agent.id,
			sessionDir,
		);
		const { session } = await createAgentSession({
			cwd: opts.agentDir,
			agentDir: opts.agentDir,
			model: model.model,
			modelRuntime: model.runtime,
			settingsManager,
			resourceLoader: loader,
			sessionManager: existing
				? SessionManager.open(existing, sessionDir, opts.agentDir)
				: SessionManager.create(opts.agentDir, sessionDir, { id: agent.id }),
			tools: [
				"read",
				"write",
				"edit",
				"ls",
				"grep",
				"bash",
				"tool_search",
				"mcp__*",
			],
			customTools: bash,
		});
		await session.bindExtensions({ mode: "rpc" });
		await mcp.startTurn(opts.plugins());
		return { session, model: model.model.id };
	}

	/** This chat's agent by id or name: in memory, or one the box kept from before (opened again when it runs). */
	function find(ref: string): Agent {
		const key = ref.trim();
		const live =
			agents.get(key) ?? [...agents.values()].find((a) => a.name === key);
		if (live) return live;
		const record = host
			.inChat(opts.chatId)
			.find((r) => r.kind === "agent" && (r.id === key || r.name === key));
		if (record) {
			const agent = blank(record.id, record.description, record.name);
			agents.set(agent.id, agent);
			return agent;
		}
		const known = host.inChat(opts.chatId).filter((r) => r.kind === "agent");
		throw new Error(
			`No agent ${ref} in this chat. ${known.length ? `Agents: ${known.map((r) => r.name ?? r.id).join(", ")}` : "There are none."}`,
		);
	}

	const blank = (id: string, description: string, name?: string): Agent => ({
		id,
		...(name ? { name } : {}),
		description,
		info: {
			id,
			agent: "agent",
			task: "",
			status: "pending",
			usage: zeroUsage(),
			model: null,
			error: null,
		},
		session: null,
		stop: null,
		background: false,
		stoppedByDev: false,
		output: "",
	});

	/** Forgets this chat's finished agents beyond `keep`, their sessions and files with them. */
	function forgetOld() {
		for (const gone of host.prune(opts.chatId, limits.keep)) {
			agents.get(gone.id)?.session?.dispose();
			agents.delete(gone.id);
			const file = SessionManager.findById(opts.agentDir, gone.id, sessionDir);
			if (file) rmSync(file, { force: true });
		}
	}

	/**
	 * One run of an agent on `prompt` (its task, or a message after it ended), in its own session, opened on first use.
	 * Messages sent while it works that it hadn't read by its end run on, in the same run. Never throws: a failure or a
	 * stop is its status. `parent` is the tool call it streams under.
	 */
	async function run(
		agent: Agent,
		prompt: string,
		parent: string,
		signal: AbortSignal,
		budget: { steps: number; timeMs: number },
	): Promise<RunResult> {
		const startedAt = Date.now();
		const info: RunInfo = {
			id: `${parent}-${agent.id}`,
			agent: agent.info.agent,
			task: cut(prompt, TASK_MAX),
			status: "pending",
			usage: zeroUsage(),
			model: null,
			error: null,
		};
		agent.info = info;
		const announce = () =>
			opts.emit({
				sessionUpdate: "tool_call_update",
				toolCallId: parent,
				_meta: { [RUN_META]: { ...info, usage: { ...info.usage } } },
			});
		const nested = (update: SessionUpdate): SessionUpdate => ({
			...update,
			_meta: { ...update._meta, [SUBAGENT_META]: { parent, run: info.id } },
		});
		announce();
		try {
			await slots.take(signal);
		} catch {
			info.status = "cancelled";
			announce();
			return { info, output: "", ms: Date.now() - startedAt };
		}
		let limited: string | null = null;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let unsubscribe = () => {};
		const abort = () => void agent.session?.abort();
		try {
			if (!agent.session) {
				const opened = await open(agent);
				agent.session = opened.session;
				info.model = opened.model;
			}
			const live = agent.session;
			info.status = "in_progress";
			announce();
			console.log(`dev-runner: agent ${agent.id} started`);
			unsubscribe = live.subscribe((event) => {
				if (event.type === "turn_end" && !limited) {
					info.usage.steps++;
					// A step without tool results is the run's last anyway: only one that would go on is stopped.
					if (
						info.usage.steps >= budget.steps &&
						event.toolResults.length > 0
					) {
						limited = `Stopped after ${budget.steps} steps`;
						abort();
					}
				}
				if (
					event.type === "message_end" &&
					event.message.role === "assistant"
				) {
					const message = event.message;
					// Under `auto` the model is picked per request: show the one that answered.
					info.model = message.model;
					const usage = message.usage;
					info.usage.input += usage.input;
					info.usage.output += usage.output;
					info.usage.cacheRead += usage.cacheRead;
					info.usage.cacheWrite += usage.cacheWrite;
					info.usage.cost += usage.cost.total;
					// Whole messages rather than streamed deltas: parallel runs interleave, and a trace stays small this way.
					for (const part of message.content) {
						if (part.type === "thinking" && part.thinking.trim())
							opts.emit(
								nested({
									sessionUpdate: "agent_thought_chunk",
									content: { type: "text", text: part.thinking },
								}),
							);
						if (part.type === "text" && part.text.trim())
							opts.emit(
								nested({
									sessionUpdate: "agent_message_chunk",
									content: { type: "text", text: part.text },
								}),
							);
					}
					announce();
					return;
				}
				if (
					event.type === "tool_execution_start" ||
					event.type === "tool_execution_end"
				) {
					for (const update of toAcpUpdates(event)) {
						if (
							update.sessionUpdate === "tool_call" ||
							update.sessionUpdate === "tool_call_update"
						)
							opts.emit(
								nested({
									...update,
									toolCallId: `${info.id}/${update.toolCallId}`,
								}),
							);
					}
				}
			});
			if (signal.aborted) throw new Error("aborted");
			signal.addEventListener("abort", abort, { once: true });
			timer = setTimeout(() => {
				limited = `Stopped after ${Math.round(budget.timeMs / 60_000)} min`;
				abort();
			}, budget.timeMs);
			// Its first run is its task; a later one is the Dev's next message to it, with everything before kept.
			let next: string | null = live.messages.some((m) => m.role === "user")
				? prompt
				: `Task: ${prompt}`;
			while (next !== null && !signal.aborted && !limited) {
				await live.prompt(next);
				const queued = live.clearQueue();
				const unread = [...queued.steering, ...queued.followUp];
				next = unread.length ? unread.join("\n\n") : null;
			}
			const last = live.messages.findLast(
				(m): m is AssistantMessage => m.role === "assistant",
			);
			const output = live.getLastAssistantText()?.trim() ?? "";
			if (signal.aborted) info.status = "cancelled";
			else if (limited)
				Object.assign(info, { status: "failed", error: limited });
			else if (last?.stopReason === "error")
				Object.assign(info, {
					status: "failed",
					error: last.errorMessage || "the model returned an error",
				});
			else info.status = "completed";
			agent.output = output;
			return { info, output, ms: Date.now() - startedAt };
		} catch (err) {
			Object.assign(
				info,
				signal.aborted
					? { status: "cancelled" }
					: {
							status: "failed",
							error: err instanceof Error ? err.message : String(err),
						},
			);
			return { info, output: agent.output, ms: Date.now() - startedAt };
		} finally {
			clearTimeout(timer);
			unsubscribe();
			signal.removeEventListener("abort", abort);
			slots.give();
			announce();
			console.log(
				`dev-runner: agent ${agent.id} ${info.status}${info.error ? `: ${info.error}` : ""}, ${info.usage.steps} steps`,
			);
		}
	}

	/** How the Dev names an agent in text. */
	const label = (agent: Agent) =>
		agent.name ? `${agent.name} (${agent.id})` : agent.id;
	const usageLine = (_agent: Agent, r: RunResult) =>
		`${r.info.usage.steps} steps, ${seconds(r.ms)}`;

	/** An agent's background run ended: its notice (none when the Dev stopped it), then old ones are forgotten. */
	async function ended(agent: Agent, r: RunResult) {
		const what = `Agent "${agent.description}"`;
		const status =
			agent.stoppedByDev || r.info.status === "cancelled"
				? "stopped"
				: r.info.status === "completed"
					? "completed"
					: "failed";
		const summary =
			status === "completed"
				? `${what} finished`
				: status === "stopped"
					? `${what} was stopped`
					: `${what} failed: ${r.info.error}`;
		await host.end(
			agent.id,
			{
				status,
				summary,
				result: status === "stopped" && !r.output ? undefined : resultText(r),
				usage: usageLine(agent, r),
			},
			{ quiet: agent.stoppedByDev },
		);
		agent.stop = null;
		agent.background = false;
		forgetOld();
	}

	/**
	 * Runs an agent on `prompt`: in the background when asked and the turn may (the box records it, and its end is a
	 * notice), else in the turn, moving to the background by itself after `autoBackgroundMs`.
	 */
	async function launch(
		agent: Agent,
		prompt: string,
		toolCallId: string,
		background: boolean,
		fresh: boolean,
		toolSignal?: AbortSignal,
	): Promise<{ text: string; done: RunResult | null }> {
		const may = canBackground();
		const budget = may
			? { steps: limits.backgroundSteps, timeMs: limits.backgroundTimeMs }
			: { steps: limits.steps, timeMs: limits.timeMs };
		// How `task_stop` (or a deleted chat) stops it: no notice, and the Dev reads what it had.
		const stopIt = () => {
			agent.stoppedByDev = true;
			agent.stop?.abort();
			return agent.output
				? `What it had so far:\n${cut(agent.output, OUTPUT_MAX)}`
				: undefined;
		};
		const toBackground = () => {
			if (host.running("agent") >= limits.background) {
				throw new Error(
					`${limits.background} agents are working in the background already. Don't retry: wait for one's notice, or do this yourself.`,
				);
			}
			if (fresh)
				host.start(
					{
						id: agent.id,
						...(agent.name ? { name: agent.name } : {}),
						kind: "agent",
						chatId: opts.chatId,
						description: agent.description,
					},
					stopIt,
				);
			else host.restart(agent.id, stopIt);
			agent.background = true;
		};
		agent.stop = new AbortController();
		agent.stoppedByDev = false;
		const stop = agent.stop;
		const NOTICE =
			"You'll get a notice when it ends: don't wait for it, check on it or guess what it will find. Tell people in a line what you started, then end the turn or carry on with other work.";
		if (background && may) {
			toBackground();
			void run(agent, prompt, toolCallId, stop.signal, budget).then((r) =>
				ended(agent, r),
			);
			return {
				text: `Agent ${label(agent)} is working in the background. ${NOTICE}`,
				done: null,
			};
		}
		// In the turn: stopped with it, until it moves to the background.
		const turn = AbortSignal.any([
			opts.turnSignal(),
			...(toolSignal ? [toolSignal] : []),
		]);
		const stopWithTurn = () => stop.abort();
		if (turn.aborted) stop.abort();
		turn.addEventListener("abort", stopWithTurn, { once: true });
		const running = run(agent, prompt, toolCallId, stop.signal, budget);
		let timer: ReturnType<typeof setTimeout> | undefined;
		const slow = may
			? new Promise<"slow">(
					(resolve) =>
						(timer = setTimeout(
							() => resolve("slow"),
							limits.autoBackgroundMs,
						)),
				)
			: new Promise<never>(() => {});
		try {
			const first = await Promise.race([running, slow]);
			if (first !== "slow") {
				agent.stop = null;
				// Recorded, ended, so `send_message` can still reach it later (after a wake too).
				if (fresh)
					host.start(
						{
							id: agent.id,
							...(agent.name ? { name: agent.name } : {}),
							kind: "agent",
							chatId: opts.chatId,
							description: agent.description,
						},
						() => {},
					);
				await host.end(
					agent.id,
					{ status: "completed", summary: "" },
					{ quiet: true },
				);
				forgetOld();
				return { text: "", done: first };
			}
			try {
				toBackground();
			} catch {
				// Too many in the background already: it stays in the turn.
				const done = await running;
				agent.stop = null;
				return { text: "", done };
			}
			turn.removeEventListener("abort", stopWithTurn);
			void running.then((r) => ended(agent, r));
			return {
				text: `This took over ${seconds(limits.autoBackgroundMs)}, so agent ${label(agent)} moved to the background and keeps working. ${NOTICE}`,
				done: null,
			};
		} finally {
			clearTimeout(timer);
		}
	}

	/** A finished run kept in the turn, for the Dev: its result and how to follow up; a failure throws. */
	function inTurn(agent: Agent, r: RunResult) {
		if (r.info.status !== "completed")
			throw new Error(`Agent ${label(agent)}: ${resultText(r)}`);
		return `${resultText(r)}\n\n(agent ${label(agent)}: ${usageLine(agent, r)}; \`send_message\` to it for a follow-up)`;
	}

	const extension = (pi: ExtensionAPI) => {
		const agentTool: ToolDefinition<
			typeof AgentParams,
			{ agentId: string; status: "async_launched" | "completed" }
		> = {
			name: "agent",
			label: "Agent",
			description: [
				"Start a subagent: a helper with its own fresh context for one part of a long task (research, a draft, a review, a batch of changes in a connected app).",
				"It sees only your prompt, so put everything it needs in it. Only its final result comes back to you; it can't post in the chat, so you decide what to say.",
				"It works in the background by default: you get its id at once and a notice when it ends, so the chat isn't held. Keep it in the turn (run_in_background: false) only when your very next step needs its result; one that takes over 2 minutes moves to the background anyway.",
				"Start several at once for independent work by calling it several times.",
			].join(" "),
			promptSnippet: "Start a subagent with its own context, in the background",
			parameters: AgentParams,
			async execute(toolCallId, params, signal) {
				if (!params.prompt.trim()) throw new Error("The agent needs a prompt.");
				const name = params.name?.trim();
				if (name && !NAME.test(name))
					throw new Error(
						"A name is letters, digits, - and _, starting with a letter.",
					);
				if (
					name &&
					host
						.inChat(opts.chatId)
						.some((r) => r.name === name && r.status === "running")
				)
					throw new Error(
						`An agent called ${name} is working already; message it with send_message, or pick another name.`,
					);
				let id: string;
				do id = `agt-${Math.random().toString(16).slice(2, 7)}`;
				while (agents.has(id) || host.get(id));
				const agent = blank(id, params.description.trim() || "agent", name);
				agents.set(id, agent);
				const { text, done } = await launch(
					agent,
					params.prompt,
					toolCallId,
					params.run_in_background ?? true,
					true,
					signal,
				);
				if (!done)
					return {
						content: [{ type: "text", text }],
						details: { agentId: id, status: "async_launched" },
					};
				if (opts.turnSignal().aborted)
					throw new Error("Stopped: the turn was cancelled");
				return {
					content: [{ type: "text", text: inTurn(agent, done) }],
					details: { agentId: id, status: "completed" },
				};
			},
		};

		const send: ToolDefinition<typeof SendParams, undefined> = {
			name: "send_message",
			label: "Message an agent",
			description:
				"Tell an agent more, by name or id. While it works, it reads your message before its next step. After it ended (even before the box last stopped), it takes your message as its next task with everything it did, in the background, and you get another notice.",
			promptSnippet: "Message a working or finished agent",
			parameters: SendParams,
			async execute(toolCallId, params, signal) {
				const agent = find(params.to);
				if (!params.message.trim()) throw new Error("The message is empty.");
				if (agent.stop) {
					await agent.session?.steer(params.message);
					return {
						content: [
							{
								type: "text",
								text: `Message queued for ${label(agent)}: it reads it before its next step.`,
							},
						],
						details: undefined,
					};
				}
				const { text, done } = await launch(
					agent,
					params.message,
					toolCallId,
					true,
					false,
					signal,
				);
				if (!done)
					return {
						content: [
							{
								type: "text",
								text: text.replace(
									"is working in the background",
									"picked it up and is working in the background",
								),
							},
						],
						details: undefined,
					};
				return {
					content: [{ type: "text", text: inTurn(agent, done) }],
					details: undefined,
				};
			},
		};

		const list: ToolDefinition<typeof NoParams, undefined> = {
			name: "list_agents",
			label: "List agents",
			// Rarely needed: loaded with `tool_search`, as Claude Code defers its own.
			exposure: "deferred",
			description:
				"List this chat's agents: name or id, whether each is working or how it ended, and what it's for.",
			promptSnippet: "List this chat's agents",
			parameters: NoParams,
			async execute() {
				const records = host
					.inChat(opts.chatId)
					.filter((r) => r.kind === "agent");
				if (!records.length)
					return {
						content: [{ type: "text", text: "No agents in this chat." }],
						details: undefined,
					};
				const now = Date.now();
				const lines = records.map((r) => {
					const live = agents.get(r.id);
					const state =
						r.status === "running"
							? live?.background
								? "working in the background"
								: "working in this turn"
							: r.status;
					return `- ${r.name ? `${r.name} (${r.id})` : r.id} · ${state} · started ${seconds(now - Date.parse(r.startedAt))} ago · ${r.description}`;
				});
				return {
					content: [{ type: "text", text: lines.join("\n") }],
					details: undefined,
				};
			},
		};

		pi.registerTool(agentTool);
		pi.registerTool(send);
		pi.registerTool(list);
	};

	return { extension };
}

/** The tools' names, for the session's tool list. */
export const SUBAGENT_TOOLS = ["agent", "send_message", "list_agents"];
