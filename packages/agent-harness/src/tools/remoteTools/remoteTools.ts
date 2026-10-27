import { isAbsolute, join, relative, resolve } from "node:path";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { type TSchema, Type } from "@earendil-works/pi-ai";
import {
	createEditTool,
	createFindTool,
	createLsTool,
	createReadTool,
	createWriteTool,
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
	truncateLine,
	truncateTail,
} from "@earendil-works/pi-coding-agent";
import type { FileChange } from "../../acp/fileDiff";
import { followJob, type HostJobs, shellQuote } from "../hostJobs";

const DEFAULT_TIMEOUT_S = 120;
const MAX_TIMEOUT_S = 600;
const MAX_WAIT_S = 1_500;
const ENDED_WITHOUT_EXIT: Partial<Record<string, string>> = {
	lost: "The workspace's host service restarted while this command ran, so it was stopped. Check what it changed before you run it again.",
	killed: "The command was killed.",
	timed_out: "The command ran past its maximum runtime and was stopped.",
};
const GREP_DEFAULT_LIMIT = 100;
const FIND_IGNORES = ["**/node_modules/**", "**/.git/**"];

export type RemoteTool = AgentTool<TSchema>;

export interface RemoteToolsOptions {
	host: HostJobs;
	sessionId: string;
	workspaceId: string;
	cwd: string;
	/** Called with a file's text before and after `write` or `edit` changes it. */
	onFileChange?: (toolCallId: string, change: FileChange) => void;
}

/**
 * pi's coding tools, running on a box through host-service. `read`, `write`,
 * `edit`, `ls` and `find` are pi's own tools with remote file operations.
 * `bash` and `grep` are ours: pi's versions spawn processes on the machine
 * running the loop.
 */
const IMAGE_SIGNATURES = [
	[0x89, 0x50, 0x4e, 0x47],
	[0xff, 0xd8, 0xff],
	[0x47, 0x49, 0x46, 0x38],
	[0x52, 0x49, 0x46, 0x46],
];

/** Images go to the model as images; any other file with a NUL byte near its start is binary. */
function isBinary(bytes: Buffer): boolean {
	if (IMAGE_SIGNATURES.some((sig) => sig.every((byte, i) => bytes[i] === byte)))
		return false;
	return bytes.subarray(0, 8_192).includes(0);
}

export function createRemoteTools(options: RemoteToolsOptions): RemoteTool[] {
	const { host, cwd } = options;
	const readBuffer = async (path: string) =>
		Buffer.from((await host.readFile({ path })).base64, "base64");
	const access = async (path: string) => {
		const info = await host.stat({ path });
		if (!info.exists)
			throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
	};
	const exists = async (path: string) => (await host.stat({ path })).exists;

	const tracked = (toolName: "write" | "edit") => {
		let toolCallId = "";
		const tool = (toolName === "write" ? createWriteTool : createEditTool)(
			cwd,
			{
				operations: {
					readFile: readBuffer,
					access,
					mkdir: async (dir: string) => {
						await host.mkdir({ path: dir });
					},
					writeFile: async (path: string, content: string) => {
						const before = await host.stat({ path });
						const oldText = before.exists
							? (await readBuffer(path)).toString("utf8")
							: null;
						await host.writeFile({
							path,
							base64: Buffer.from(content, "utf8").toString("base64"),
							createParents: true,
						});
						options.onFileChange?.(toolCallId, {
							path,
							oldText,
							newText: content,
						});
					},
				},
			},
		);
		return {
			...tool,
			execute: (id: string, ...rest: unknown[]) => {
				toolCallId = id;
				return (
					tool.execute as (
						...args: unknown[]
					) => Promise<AgentToolResult<unknown>>
				)(id, ...rest);
			},
		} as RemoteTool;
	};

	const readText = async (path: string) => {
		const bytes = await readBuffer(path);
		if (isBinary(bytes)) {
			throw new Error(
				`${path} is a binary file (${bytes.length} bytes). Inspect it with bash instead, for example \`file\` or \`xxd | head\`.`,
			);
		}
		return bytes;
	};

	return [
		createReadTool(cwd, { operations: { readFile: readText, access } }),
		tracked("write"),
		tracked("edit"),
		createLsTool(cwd, {
			operations: {
				exists,
				stat: async (path) => {
					const info = await host.stat({ path });
					if (!info.exists) throw new Error(`Path not found: ${path}`);
					return { isDirectory: () => info.isDirectory };
				},
				readdir: async (path) =>
					(await host.readdir({ path })).map((entry) => entry.name),
			},
		}),
		createFindTool(cwd, {
			operations: {
				exists,
				glob: async (pattern, searchPath, { ignore, limit }) => {
					const globs = [
						pattern,
						...[...FIND_IGNORES, ...ignore].map((g) => `!${g}`),
					];
					const command = `cd ${shellQuote(searchPath)} && rg --files --hidden ${globs
						.map((g) => `--glob ${shellQuote(g)}`)
						.join(" ")} | head -n ${limit}`;
					const result = await runOnce(
						options,
						`find:${pattern}:${searchPath}`,
						command,
					);
					return result.output
						.split("\n")
						.filter(Boolean)
						.map((line) => join(searchPath, line));
				},
			},
		}),
		createGrepTool(options),
		createBashTool(options),
		createJobWaitTool(options),
		createJobKillTool(options),
	];
}

async function runOnce(
	options: RemoteToolsOptions,
	key: string,
	command: string,
	signal?: AbortSignal,
) {
	const job = await options.host.exec({
		callId: `${options.sessionId}:${key}:${Date.now()}:${Math.random()}`,
		sessionId: options.sessionId,
		workspaceId: options.workspaceId,
		command,
		maxRuntimeMs: 120_000,
	});
	return followJob(options.host, {
		sessionId: options.sessionId,
		jobId: job.jobId,
		deadlineMs: Date.now() + 120_000,
		signal,
	});
}

function text(value: string, details?: unknown): AgentToolResult<unknown> {
	return { content: [{ type: "text", text: value }], details };
}

const bashParameters = Type.Object({
	command: Type.String({ description: "Bash command to run" }),
	description: Type.Optional(
		Type.String({
			description:
				"A short description of what the command does, shown to people",
		}),
	),
	timeout: Type.Optional(
		Type.Number({
			description: `Seconds to wait before moving the command to the background (default ${DEFAULT_TIMEOUT_S}, max ${MAX_TIMEOUT_S})`,
		}),
	),
	background: Type.Optional(
		Type.Boolean({
			description: "Start in the background and return its job_id at once",
		}),
	),
});

function createBashTool(
	options: RemoteToolsOptions,
): AgentTool<typeof bashParameters> {
	return {
		name: "bash",
		label: "bash",
		description: `Run a bash command in the workspace. Returns stdout and stderr, truncated to the last ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB; the full output stays in the job log at output_path. A command still running when its timeout passes is not killed: it becomes a background job and you get its job_id. Set background to start a long command (dev servers, long builds) and keep working; use job_wait when you need its result.`,
		parameters: bashParameters,
		async execute(toolCallId, params, signal, onUpdate) {
			const { host, sessionId, workspaceId } = options;
			const job = await host.exec({
				callId: `${sessionId}:${toolCallId}`,
				sessionId,
				workspaceId,
				command: params.command,
				...(params.description ? { description: params.description } : {}),
			});
			const started = {
				job_id: job.jobId,
				pid: job.pid,
				output_path: job.logPath,
			};
			if (params.background) {
				return text(
					`Started in the background.\njob_id: ${job.jobId}\npid: ${job.pid ?? ""}\noutput_path: ${job.logPath}`,
					started,
				);
			}
			const timeoutS = Math.min(
				Math.max(params.timeout ?? DEFAULT_TIMEOUT_S, 1),
				MAX_TIMEOUT_S,
			);
			let seen = "";
			let result: Awaited<ReturnType<typeof followJob>>;
			try {
				result = await followJob(host, {
					sessionId,
					jobId: job.jobId,
					deadlineMs: Date.now() + timeoutS * 1000,
					signal,
					onData: (chunk) => {
						seen += chunk;
						onUpdate?.(text(truncateTail(seen).content));
					},
				});
			} catch (error) {
				if (signal?.aborted) {
					await host.kill({ sessionId, jobId: job.jobId });
					throw new Error("Command aborted");
				}
				throw error;
			}
			const truncation = truncateTail(result.output);
			let output = truncation.content || "(no output)";
			if (truncation.truncated) {
				output += `\n\n[Showing the last ${truncation.outputLines} of ${truncation.totalLines} lines. Full output: ${result.logPath}]`;
			}
			const details = {
				...started,
				exit_code: result.exitCode,
				truncated: truncation.truncated,
			};
			if (result.status === "running") {
				return text(
					`${output}\n\nStill running after ${timeoutS}s, so it moved to the background.\njob_id: ${job.jobId}\noutput_path: ${result.logPath}`,
					details,
				);
			}
			if (result.status !== "done") {
				throw new Error(
					`${output}\n\n${result.exitCode === null ? (ENDED_WITHOUT_EXIT[result.status] ?? `Command ${result.status}`) : `Command exited with code ${result.exitCode}`}`,
				);
			}
			return text(output, details);
		},
	};
}

const jobWaitParameters = Type.Object({
	job_id: Type.String(),
	wait_seconds: Type.Number({
		description: `Max seconds to wait (max ${MAX_WAIT_S})`,
	}),
	pattern: Type.Optional(
		Type.String({
			description:
				"Stop waiting when the output matches this regex (multiline)",
		}),
	),
});

function createJobWaitTool(
	options: RemoteToolsOptions,
): AgentTool<typeof jobWaitParameters> {
	return {
		name: "job_wait",
		label: "job_wait",
		description:
			"Wait for a background job, or until its output matches a regex. Returns its status and the end of its output. Only wait when your next step needs the result; otherwise keep working and check back later.",
		parameters: jobWaitParameters,
		async execute(_toolCallId, params, signal) {
			const waitS = Math.min(Math.max(params.wait_seconds, 0), MAX_WAIT_S);
			const result = await followJob(options.host, {
				sessionId: options.sessionId,
				jobId: params.job_id,
				deadlineMs: Date.now() + waitS * 1000,
				...(params.pattern ? { pattern: params.pattern } : {}),
				signal,
			});
			const tail = truncateTail(result.output).content;
			return text(
				`status: ${result.status}${result.exitCode === null ? "" : `\nexit_code: ${result.exitCode}`}${params.pattern ? `\nmatched: ${result.matched}` : ""}\noutput_path: ${result.logPath}\n\n${tail}`,
				{
					status: result.status,
					exit_code: result.exitCode,
					matched: result.matched,
				},
			);
		},
	};
}

const jobKillParameters = Type.Object({ job_id: Type.String() });

function createJobKillTool(
	options: RemoteToolsOptions,
): AgentTool<typeof jobKillParameters> {
	return {
		name: "job_kill",
		label: "job_kill",
		description: "Stop a background job and the processes it started.",
		parameters: jobKillParameters,
		async execute(_toolCallId, params) {
			const { status } = await options.host.kill({
				sessionId: options.sessionId,
				jobId: params.job_id,
			});
			return text(`status: ${status}`, { status });
		},
	};
}

interface RgEvent {
	type: string;
	data?: {
		path?: { text?: string };
		line_number?: number;
		lines?: { text?: string };
	};
}

const grepParameters = Type.Object({
	pattern: Type.String({
		description: "Search pattern (regex or literal string)",
	}),
	path: Type.Optional(
		Type.String({
			description: "Directory or file to search (default: current directory)",
		}),
	),
	glob: Type.Optional(
		Type.String({
			description: "Filter files by glob pattern, e.g. '*.ts'",
		}),
	),
	ignoreCase: Type.Optional(
		Type.Boolean({ description: "Case-insensitive search" }),
	),
	literal: Type.Optional(
		Type.Boolean({ description: "Treat pattern as a literal string" }),
	),
	context: Type.Optional(
		Type.Number({
			description: "Lines to show before and after each match",
		}),
	),
	limit: Type.Optional(
		Type.Number({
			description: `Max matches (default ${GREP_DEFAULT_LIMIT})`,
		}),
	),
});

function createGrepTool(
	options: RemoteToolsOptions,
): AgentTool<typeof grepParameters> {
	return {
		name: "grep",
		label: "grep",
		description: `Search file contents for a pattern. Returns matching lines with file paths and line numbers. Respects .gitignore. Output is truncated to ${GREP_DEFAULT_LIMIT} matches or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Long lines are truncated.`,
		parameters: grepParameters,
		async execute(_toolCallId, params, signal) {
			const searchPath = isAbsolute(params.path ?? ".")
				? (params.path as string)
				: resolve(options.cwd, params.path ?? ".");
			const info = await options.host.stat({ path: searchPath });
			if (!info.exists) throw new Error(`Path not found: ${searchPath}`);
			const limit = Math.max(1, params.limit ?? GREP_DEFAULT_LIMIT);
			const context =
				params.context && params.context > 0 ? Math.floor(params.context) : 0;
			const args = [
				"--no-config",
				"--json",
				"--line-number",
				"--color=never",
				"--hidden",
			];
			if (params.ignoreCase) args.push("--ignore-case");
			if (params.literal) args.push("--fixed-strings");
			if (params.glob) args.push("--glob", params.glob);
			if (context) args.push("--context", String(context));
			args.push("--", params.pattern, searchPath);
			const command = `rg ${args.map(shellQuote).join(" ")}; code=$?; [ $code -le 1 ] || exit $code`;
			const result = await runOnce(
				options,
				`grep:${params.pattern}`,
				command,
				signal,
			);
			if (result.status !== "done") {
				throw new Error(result.output.trim() || `ripgrep ${result.status}`);
			}

			const formatPath = (filePath: string) => {
				if (info.isDirectory) {
					const rel = relative(searchPath, filePath);
					if (rel && !rel.startsWith("..")) return rel.replace(/\\/g, "/");
				}
				return filePath.split("/").pop() ?? filePath;
			};
			const lines: string[] = [];
			let matches = 0;
			let linesTruncated = false;
			for (const line of result.output.split("\n")) {
				if (!line.trim()) continue;
				let event: RgEvent;
				try {
					event = JSON.parse(line) as RgEvent;
				} catch {
					continue;
				}
				if (event.type !== "match" && event.type !== "context") continue;
				const filePath = event.data?.path?.text;
				const lineNumber = event.data?.line_number;
				if (!filePath || typeof lineNumber !== "number") continue;
				if (event.type === "match") {
					if (matches >= limit) break;
					matches++;
				}
				const raw = (event.data?.lines?.text ?? "")
					.replace(/\r?\n$/, "")
					.replace(/\r/g, "");
				const { text: shown, wasTruncated } = truncateLine(raw);
				if (wasTruncated) linesTruncated = true;
				lines.push(
					event.type === "match"
						? `${formatPath(filePath)}:${lineNumber}: ${shown}`
						: `${formatPath(filePath)}-${lineNumber}- ${shown}`,
				);
			}
			if (matches === 0) return text("No matches found");
			const truncation = truncateHead(lines.join("\n"), {
				maxLines: Number.MAX_SAFE_INTEGER,
			});
			const notices: string[] = [];
			if (matches >= limit) notices.push(`${limit} matches limit reached`);
			if (truncation.truncated)
				notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
			if (linesTruncated) notices.push("Some lines truncated");
			const body = notices.length
				? `${truncation.content}\n\n[${notices.join(". ")}]`
				: truncation.content;
			return text(body, {
				matchLimitReached: matches >= limit ? limit : undefined,
			});
		},
	};
}
