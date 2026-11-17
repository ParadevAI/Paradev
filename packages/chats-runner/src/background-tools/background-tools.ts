import { type ChildProcess, spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	type ToolDefinition,
	truncateTail,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { BackgroundHost } from "../background/background.ts";

export interface BackgroundToolsOptions {
	agentDir: string;
	chatId: string;
	host: BackgroundHost;
	/** The running turn's env, added to every command so `dev` works. */
	turnEnv: () => Record<string, string>;
	/** Aborted when the running turn is cancelled. */
	turnSignal: () => AbortSignal;
	/** Whether the running turn may move work to the background (a chat's own turn). */
	canBackground: () => boolean;
	/** Where commands' output goes; the box's temp storage, gone with the box. */
	logDir?: string;
	limits?: Partial<CommandLimits>;
}

export interface CommandLimits {
	/** A command kept in the turn: its timeout by default and at most (Claude Code: 2 min, 10 min). */
	foregroundMs: number;
	foregroundMaxMs: number;
	/** A command in the background: its life by default and at most (Claude Code: 30 min, 2 h). */
	backgroundMs: number;
	backgroundMaxMs: number;
	/** A monitor: its life by default and at most. */
	monitorMs: number;
	monitorMaxMs: number;
	/** A monitor's new lines are gathered this long into one notice, so a burst is one turn. */
	monitorBatchMs: number;
	/** Notices one monitor may send an hour before it's stopped: each can be a turn. */
	monitorPerHour: number;
}

const DEFAULT_COMMAND_LIMITS: CommandLimits = {
	foregroundMs: 120_000,
	foregroundMaxMs: 600_000,
	backgroundMs: 30 * 60_000,
	backgroundMaxMs: 2 * 60 * 60_000,
	monitorMs: 5 * 60_000,
	monitorMaxMs: 60 * 60_000,
	monitorBatchMs: 5_000,
	monitorPerHour: 30,
};

const BashParams = Type.Object({
	command: Type.String({ description: "The bash command to run" }),
	timeout: Type.Optional(
		Type.Number({
			description:
				"In milliseconds. Kept in the turn: how long it may take before it moves to the background (default 2 min, at most 10). In the background: how long it may run (default 30 min, at most 2 h)",
		}),
	),
	run_in_background: Type.Optional(
		Type.Boolean({
			description:
				"Run it in the background (a server, a long build, a slow download): you get its id and output file at once, and a notice when it exits",
		}),
	),
	description: Type.Optional(
		Type.String({
			description: "A few words for what it does, for its notice",
		}),
	),
});

const MonitorParams = Type.Object({
	description: Type.String({
		description: "A few words for what it watches: each notice names it",
	}),
	command: Type.String({
		description:
			"A command whose every new line of output is an event (`tail -f`, a polling loop that prints only on change)",
	}),
	timeout_ms: Type.Optional(
		Type.Number({
			description:
				"How long it watches, in milliseconds: default 5 min, at most 60",
		}),
	),
});

const StopParams = Type.Object({
	task_id: Type.String({
		description: "The id (or an agent's name) of background work",
	}),
});

const firstLine = (text: string, max = 60) => {
	const line = text.trim().split("\n")[0] ?? "";
	return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};
const tail = (text: string) =>
	truncateTail(text, {
		maxLines: DEFAULT_MAX_LINES,
		maxBytes: DEFAULT_MAX_BYTES,
	}).content;
const lastLines = (text: string, n: number) =>
	text.trimEnd().split("\n").slice(-n).join("\n");
const clamp = (value: number | undefined, fallback: number, max: number) =>
	Math.min(Math.max(1_000, value ?? fallback), max);
const seconds = (ms: number) =>
	ms < 90_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`;

/** Kills a command and whatever it started (its own process group). */
function kill(child: ChildProcess) {
	if (child.exitCode !== null || child.pid === undefined) return;
	try {
		process.kill(-child.pid, "SIGTERM");
	} catch {
		child.kill("SIGTERM");
	}
}

/**
 * Commands and monitors as Claude Code has them, for the Dev's own session: `bash` runs a command kept in the turn,
 * or in the background (`run_in_background`), and one that outlasts its timeout moves to the background rather than
 * being killed; `monitor` turns each new line of a command into a notice; `task_stop` stops any background work (an
 * agent, a command, a monitor). Background work is the box's (`BackgroundHost`): its output goes to a file in the box's
 * temp storage, and its notice reaches the chat when it ends. Given to the session as custom tools, so this `bash`
 * takes the place of pi's.
 */
export function backgroundTools(
	opts: BackgroundToolsOptions,
): ToolDefinition[] {
	const limits: CommandLimits = { ...DEFAULT_COMMAND_LIMITS, ...opts.limits };
	const logDir = opts.logDir ?? join(tmpdir(), "dev-tasks", opts.chatId);
	const { host } = opts;

	function start(command: string) {
		mkdirSync(logDir, { recursive: true });
		const id = `sh-${Math.random().toString(16).slice(2, 7)}`;
		const file = join(logDir, `${id}.log`);
		const log = createWriteStream(file);
		// Its own process group, so stopping it stops what it started too.
		const child = spawn("bash", ["-c", command], {
			cwd: opts.agentDir,
			env: { ...process.env, ...opts.turnEnv() },
			detached: true,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let output = "";
		const onData = (chunk: Buffer) => {
			log.write(chunk);
			output += chunk.toString();
			// Only the tail matters to the Dev; the file has all of it.
			if (output.length > 4 * DEFAULT_MAX_BYTES)
				output = output.slice(-2 * DEFAULT_MAX_BYTES);
		};
		child.stdout?.on("data", onData);
		child.stderr?.on("data", onData);
		const exited = new Promise<number>((resolve) => {
			child.on("close", (code, signal) => {
				log.end();
				resolve(code ?? (signal ? 128 : 1));
			});
			child.on("error", (err) => {
				onData(Buffer.from(`${err.message}\n`));
				log.end();
				resolve(127);
			});
		});
		return { id, file, child, exited, output: () => output };
	}

	/** A command from now on in the background: its life is bounded, and its exit is a notice. */
	function background(
		run: ReturnType<typeof start>,
		description: string,
		lifeMs: number,
	) {
		let stopped = false;
		let expired = false;
		host.start(
			{ id: run.id, kind: "shell", chatId: opts.chatId, description },
			() => {
				stopped = true;
				kill(run.child);
			},
		);
		const timer = setTimeout(() => {
			expired = true;
			kill(run.child);
		}, lifeMs);
		void run.exited.then((code) => {
			clearTimeout(timer);
			const what = `Command "${description}"`;
			const summary = expired
				? `${what} was stopped after its ${seconds(lifeMs)} limit`
				: stopped
					? `${what} was stopped`
					: `${what} exited with code ${code}`;
			const status = stopped
				? "stopped"
				: code === 0 && !expired
					? "completed"
					: "failed";
			return host.end(
				run.id,
				{
					status,
					summary,
					outputFile: run.file,
					result: lastLines(run.output(), 40) || "(no output)",
				},
				{ quiet: stopped },
			);
		});
	}

	const backgroundNote = (id: string, file: string) =>
		`Its output goes to ${file}. You'll get a notice when it exits: don't poll that file or sleep. Read it only when someone asks how it's going or you need a line from it (a server's "ready", say); \`task_stop\` ${id} stops it.`;

	{
		const bash: ToolDefinition<
			typeof BashParams,
			{ backgroundTaskId?: string; exitCode?: number }
		> = {
			name: "bash",
			label: "bash",
			description:
				"Run a bash command in /agent, with this turn's env (so `dev` works). Kept in the turn it returns its output (the tail of a long one); one that outlasts its timeout moves to the background instead of being killed. With run_in_background (a server, a long build or download) you get its id and output file at once and a notice when it exits.",
			promptSnippet: "Run bash commands, in the background for long ones",
			parameters: BashParams,
			async execute(_toolCallId, params, signal) {
				const may = opts.canBackground();
				const description =
					params.description?.trim() || firstLine(params.command);
				if (params.run_in_background && may) {
					const run = start(params.command);
					background(
						run,
						description,
						clamp(params.timeout, limits.backgroundMs, limits.backgroundMaxMs),
					);
					return {
						content: [
							{
								type: "text",
								text: `Command running in the background with ID ${run.id}. ${backgroundNote(run.id, run.file)}`,
							},
						],
						details: { backgroundTaskId: run.id },
					};
				}
				const timeoutMs = clamp(
					params.timeout,
					limits.foregroundMs,
					limits.foregroundMaxMs,
				);
				const run = start(params.command);
				const turn = AbortSignal.any([
					opts.turnSignal(),
					...(signal ? [signal] : []),
				]);
				const stop = () => kill(run.child);
				if (turn.aborted) stop();
				turn.addEventListener("abort", stop, { once: true });
				let timer: ReturnType<typeof setTimeout> | undefined;
				const late = new Promise<"late">(
					(resolve) => (timer = setTimeout(() => resolve("late"), timeoutMs)),
				);
				try {
					const first = await Promise.race([run.exited, late]);
					if (first === "late") {
						if (!may) {
							stop();
							await run.exited;
							throw new Error(
								`${tail(run.output())}\n\nCommand timed out after ${seconds(timeoutMs)} and was stopped.`.trim(),
							);
						}
						turn.removeEventListener("abort", stop);
						background(run, description, limits.backgroundMs);
						const sofar = lastLines(run.output(), 20);
						return {
							content: [
								{
									type: "text",
									text: `Command didn't finish within its ${seconds(timeoutMs)} timeout, so it moved to the background with ID ${run.id}.${sofar ? `\n\nIts output so far:\n${sofar}` : ""}\n\n${backgroundNote(run.id, run.file)}`,
								},
							],
							details: { backgroundTaskId: run.id },
						};
					}
					if (turn.aborted) throw new Error("Stopped: the turn was cancelled");
					const output = tail(run.output()) || "(no output)";
					if (first !== 0)
						throw new Error(`${output}\n\nCommand exited with code ${first}`);
					return {
						content: [{ type: "text", text: output }],
						details: { exitCode: first },
					};
				} finally {
					clearTimeout(timer);
					turn.removeEventListener("abort", stop);
				}
			},
		};

		const monitor: ToolDefinition<typeof MonitorParams, { taskId: string }> = {
			name: "monitor",
			label: "Monitor",
			// Rarely needed: loaded with `tool_search`, as Claude Code defers its own.
			exposure: "deferred",
			description:
				"Watch a command in the background: each new line it prints reaches you as a notice (a few seconds of lines together), so you hear about a log line, a status change or a finished deploy without checking. Keep working, don't poll or sleep; a notice is the command's output, not someone's reply. Make the command print only what matters (`tail -f log | grep --line-buffered ERROR`, a loop that prints on change). It stops at its timeout (default 5 min, at most 60) or with `task_stop`.",
			promptSnippet: "Watch a command's output in the background",
			parameters: MonitorParams,
			async execute(_toolCallId, params) {
				if (!opts.canBackground())
					throw new Error(
						"A monitor needs a chat's own turn (not an ask's, a trigger's or a visitor's).",
					);
				const lifeMs = clamp(
					params.timeout_ms,
					limits.monitorMs,
					limits.monitorMaxMs,
				);
				const run = start(params.command);
				const description =
					params.description.trim() || firstLine(params.command);
				let stopped = false;
				let flooded = false;
				let pending: string[] = [];
				let sentThisHour: number[] = [];
				let read = 0;
				const flush = () => {
					if (!pending.length) return;
					const now = Date.now();
					sentThisHour = sentThisHour.filter((at) => now - at < 3_600_000);
					if (sentThisHour.length >= limits.monitorPerHour) {
						flooded = true;
						kill(run.child);
						return;
					}
					sentThisHour.push(now);
					const lines = pending.join("\n");
					pending = [];
					void host.event(
						run.id,
						`Monitor "${description}" saw ${lines.split("\n").length} new line${lines.includes("\n") ? "s" : ""}`,
						lines,
					);
				};
				const batch = setInterval(flush, limits.monitorBatchMs);
				// New lines since the last look, from the file the command writes to.
				const poll = setInterval(() => {
					const text = readFileSync(run.file, "utf8");
					const fresh = text.slice(read);
					const end = fresh.lastIndexOf("\n");
					if (end < 0) return;
					read += end + 1;
					pending.push(
						...fresh
							.slice(0, end)
							.split("\n")
							.filter((l) => l.trim()),
					);
				}, 500);
				host.start(
					{ id: run.id, kind: "monitor", chatId: opts.chatId, description },
					() => {
						stopped = true;
						kill(run.child);
					},
				);
				const timer = setTimeout(() => kill(run.child), lifeMs);
				void run.exited.then(async (code) => {
					clearTimeout(timer);
					clearInterval(poll);
					clearInterval(batch);
					const what = `Monitor "${description}"`;
					const summary = flooded
						? `${what} was stopped: more than ${limits.monitorPerHour} notices in an hour. Narrow what it prints before starting it again`
						: stopped
							? `${what} was stopped`
							: code === 0 || code >= 128
								? `${what} ended after ${seconds(lifeMs)}; start it again if you still need it`
								: `${what}'s command exited with code ${code}`;
					await host.end(
						run.id,
						{
							status: stopped
								? "stopped"
								: flooded || (code !== 0 && code < 128)
									? "failed"
									: "completed",
							summary,
							outputFile: run.file,
							result: lastLines(run.output(), 10) || undefined,
						},
						{ quiet: stopped },
					);
				});
				return {
					content: [
						{
							type: "text",
							text: `Monitor started with ID ${run.id}: you'll get a notice for its new lines. Keep working; don't poll or sleep. \`task_stop\` ${run.id} stops it.`,
						},
					],
					details: { taskId: run.id },
				};
			},
		};

		const stop: ToolDefinition<typeof StopParams, undefined> = {
			name: "task_stop",
			label: "Stop background work",
			exposure: "deferred",
			description:
				"Stop background work by id (an agent's name works too): an agent, a command or a monitor. No notice comes for it.",
			promptSnippet: "Stop background work",
			parameters: StopParams,
			async execute(_toolCallId, params) {
				const ref = params.task_id.trim();
				const record =
					host.get(ref) ?? host.inChat(opts.chatId).find((r) => r.name === ref);
				if (!record || record.chatId !== opts.chatId)
					throw new Error(`No background work ${ref} in this chat.`);
				const stopped = host.stop(record.id);
				if (!stopped)
					return {
						content: [
							{
								type: "text",
								text: `${ref} isn't running (${record.status}).`,
							},
						],
						details: undefined,
					};
				return {
					content: [
						{
							type: "text",
							text: `Stopped ${ref}.${stopped.said ? `\n\n${stopped.said}` : ""}`,
						},
					],
					details: undefined,
				};
			},
		};

		// pi's own tool definitions are generic over their args; customTools takes the erased form. `bash` replaces pi's.
		return [bash, monitor, stop] as unknown as ToolDefinition[];
	}
}

/** The tools' names, for the session's tool list. */
export const BACKGROUND_TOOLS = ["bash", "monitor", "task_stop"];
