import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { open, opendir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_RECORDS = 1024;
const MAX_RECORD_BYTES = 64 * 1024;

interface WriterRecord {
	pid: number;
	procStart: string;
	entrypoint?: string;
	kind?: string;
}

export type ClaudeSessionWriterOwner =
	| "claude-desktop"
	| "background"
	| "terminal"
	| "unknown";

export interface ClaudeSessionWriter extends WriterRecord {
	owner: ClaudeSessionWriterOwner;
}

interface WriterDeps {
	platform?: NodeJS.Platform;
	processStarts?: typeof readProcessStarts;
}

function missing(error: unknown) {
	return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

export function processStartFingerprint(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim().replace(/\s+/g, " ");
	return /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/.test(
		normalized,
	)
		? normalized
		: null;
}

export async function readProcessStarts(
	pids: number[],
): Promise<Map<number, string>> {
	if (pids.length === 0) return new Map();
	let stdout: string;
	try {
		({ stdout } = await execFileAsync(
			"/bin/ps",
			["-p", pids.join(","), "-o", "pid=,lstart="],
			{
				env: { ...process.env, TZ: "UTC", LC_ALL: "C" },
				timeout: 2000,
				maxBuffer: 256 * 1024,
			},
		));
	} catch (error) {
		const failed = error as {
			code?: unknown;
			stdout?: string;
			stderr?: string;
		};
		if (failed.code === 1 && !failed.stdout?.trim() && !failed.stderr?.trim())
			return new Map();
		throw new Error("The native session processes could not be checked.");
	}
	const result = new Map<number, string>();
	for (const line of stdout.split("\n")) {
		if (!line.trim()) continue;
		const match = /^\s*(\d+)\s+(.+)$/.exec(line);
		const start = processStartFingerprint(match?.[2]);
		if (!match || !start)
			throw new Error("The native session process format was not recognized.");
		result.set(Number(match[1]), start);
	}
	return result;
}

/** Native records are positive writer evidence, not an exclusive lock. Older
 * CLI versions can omit them; an empty result never proves global absence. */
async function liveWriterRecords(
	input: { sessionId: string; directories: string[] },
	deps: WriterDeps,
): Promise<WriterRecord[]> {
	const platform = deps.platform ?? process.platform;
	if (platform !== "darwin" && platform !== "linux") return [];
	const roots = new Set<string>();
	const records: WriterRecord[] = [];
	let visited = 0;
	for (const directory of new Set(input.directories)) {
		let root: string;
		try {
			root = await realpath(join(directory, "sessions"));
		} catch (error) {
			if (missing(error)) continue;
			throw new Error("The native session registry could not be checked.");
		}
		if (roots.has(root)) continue;
		roots.add(root);
		for await (const entry of await opendir(root)) {
			if (++visited > MAX_RECORDS)
				throw new Error(
					"The native session registry is too large to check safely.",
				);
			if (!/^\d+\.json$/.test(entry.name)) continue;
			if (!entry.isFile())
				throw new Error(
					"The native session registry contains an unreadable record.",
				);
			let record: Record<string, unknown>;
			try {
				const handle = await open(
					join(root, entry.name),
					constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
				);
				try {
					const metadata = await handle.stat();
					if (!metadata.isFile() || metadata.size > MAX_RECORD_BYTES)
						throw new Error("Invalid session record");
					const buffer = Buffer.alloc(MAX_RECORD_BYTES + 1);
					const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
					if (bytesRead > MAX_RECORD_BYTES)
						throw new Error("Oversized session record");
					record = JSON.parse(buffer.subarray(0, bytesRead).toString("utf8"));
				} finally {
					await handle.close();
				}
			} catch (error) {
				if (missing(error)) continue;
				throw new Error(
					"The native session registry could not be read. Retry after the agent is idle.",
				);
			}
			if (
				!record ||
				typeof record !== "object" ||
				Array.isArray(record) ||
				typeof record.sessionId !== "string" ||
				!record.sessionId
			)
				throw new Error(
					"The native session registry format was not recognized.",
				);
			if (record.sessionId !== input.sessionId) continue;
			const pid = record.pid;
			const start = processStartFingerprint(record.procStart);
			if (
				!Number.isSafeInteger(pid) ||
				typeof pid !== "number" ||
				pid <= 0 ||
				pid > 2_147_483_647 ||
				entry.name !== `${pid}.json` ||
				!start ||
				record.pidDomain !== platform
			)
				throw new Error(
					"The conversation's native process identity could not be verified.",
				);
			records.push({
				pid,
				procStart: start,
				...(typeof record.entrypoint === "string"
					? { entrypoint: record.entrypoint }
					: {}),
				...(typeof record.kind === "string" ? { kind: record.kind } : {}),
			});
		}
	}
	const starts = await (deps.processStarts ?? readProcessStarts)([
		...new Set(records.map((record) => record.pid)),
	]);
	return records.filter(
		(record) => starts.get(record.pid) === record.procStart,
	);
}

export async function findClaudeSessionWriters(
	input: { sessionId: string; directories: string[] },
	deps: WriterDeps = {},
): Promise<number[]> {
	return [
		...new Set((await liveWriterRecords(input, deps)).map(({ pid }) => pid)),
	];
}

interface OwnerProcess {
	pid: number;
	parentPid: number;
	procStart: string;
	executable: string;
}

type OwnerRun = (file: string, args: string[]) => Promise<string>;

function ownerRun(): OwnerRun {
	const signal = AbortSignal.timeout(4000);
	return async (file, args) =>
		(
			await execFileAsync(file, args, {
				env: { ...process.env, TZ: "UTC", LC_ALL: "C" },
				signal,
				timeout: 1500,
				maxBuffer: 256 * 1024,
			})
		).stdout;
}

async function ownerProcess(pid: number, run: OwnerRun): Promise<OwnerProcess> {
	const read = async () => {
		const output = await run("/bin/ps", [
			"-ww",
			"-p",
			String(pid),
			"-o",
			"pid=,ppid=,lstart=,comm=",
		]);
		const match =
			/^\s*(\d+)\s+(\d+)\s+([A-Z][a-z]{2} [A-Z][a-z]{2}\s+\d{1,2} \d{2}:\d{2}:\d{2} \d{4})\s+([^\r\n]+)\s*$/.exec(
				output,
			);
		if (!match || Number(match[1]) !== pid || !isAbsolute(match[4] ?? ""))
			throw new Error("Unknown process owner");
		return {
			pid,
			parentPid: Number(match[2]),
			procStart: processStartFingerprint(match[3]) ?? "",
			executable: match[4]?.trim() ?? "",
		};
	};
	const before = await read();
	const mapped = await run("/usr/sbin/lsof", [
		"-nP",
		"-a",
		"-p",
		String(pid),
		"-d",
		"txt",
		"-Fpn",
	]);
	if (
		!mapped.split("\n").includes(`p${pid}`) ||
		!mapped.split("\n").includes(`n${before.executable}`) ||
		JSON.stringify(await read()) !== JSON.stringify(before)
	)
		throw new Error("Unknown process owner");
	return before;
}

export async function inspectClaudeWriterOwner(
	record: WriterRecord,
	deps: { platform?: NodeJS.Platform; run?: OwnerRun; home?: string } = {},
): Promise<ClaudeSessionWriterOwner> {
	if ((deps.platform ?? process.platform) !== "darwin") return "unknown";
	try {
		const run = deps.run ?? ownerRun();
		const child = await ownerProcess(record.pid, run);
		if (child.procStart !== record.procStart) return "unknown";
		if (record.entrypoint === "claude-desktop") {
			const root = join(
				deps.home ?? homedir(),
				"Library/Application Support/Claude/claude-code",
			);
			if (
				!child.executable.startsWith(`${root}/`) ||
				!/^\d+\.\d+\.\d+\/[a-f0-9]+\/claude\.app\/Contents\/MacOS\/claude$/.test(
					child.executable.slice(root.length + 1),
				)
			)
				return "unknown";
			const parent = await ownerProcess(child.parentPid, run);
			const desktop = await ownerProcess(parent.parentPid, run);
			return parent.executable ===
				"/Applications/Claude.app/Contents/Helpers/disclaimer" &&
				desktop.executable ===
					"/Applications/Claude.app/Contents/MacOS/Claude" &&
				JSON.stringify(await ownerProcess(child.pid, run)) ===
					JSON.stringify(child) &&
				JSON.stringify(await ownerProcess(parent.pid, run)) ===
					JSON.stringify(parent) &&
				JSON.stringify(await ownerProcess(desktop.pid, run)) ===
					JSON.stringify(desktop)
				? "claude-desktop"
				: "unknown";
		}
		const root = join(deps.home ?? homedir(), ".local/share/claude/versions");
		if (
			!child.executable.startsWith(`${root}/`) ||
			!/^\d+\.\d+\.\d+$/.test(child.executable.slice(root.length + 1))
		)
			return "unknown";
		return record.kind === "background"
			? "background"
			: record.kind === "interactive"
				? "terminal"
				: "unknown";
	} catch {
		return "unknown";
	}
}

export async function findClaudeSessionWriterDetails(
	input: { sessionId: string; directories: string[] },
	deps: WriterDeps & {
		owner?: typeof inspectClaudeWriterOwner;
	} = {},
): Promise<ClaudeSessionWriter[]> {
	const records = await liveWriterRecords(input, deps);
	const detailed = await Promise.all(
		records.map(async (record) => ({
			...record,
			owner:
				records.length > 8
					? ("unknown" as const)
					: await (deps.owner ?? inspectClaudeWriterOwner)(record, {
							platform: deps.platform,
						}),
		})),
	);
	const starts = await (deps.processStarts ?? readProcessStarts)([
		...new Set(detailed.map(({ pid }) => pid)),
	]);
	return [
		...new Map(
			detailed
				.filter(({ pid, procStart }) => starts.get(pid) === procStart)
				.map((writer) => [writer.pid, writer]),
		).values(),
	];
}
