import { execFile } from "node:child_process";
import { readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { HostDb } from "../../../db";
import { terminalSessions } from "../../../db/schema";
import { getDaemonClient } from "../../../terminal/daemon-client-singleton";
import {
	processStartFingerprint,
	readProcessStarts,
} from "../../../terminal-agents/claude-session-writers";
import { readProfileFile } from "../usage/profile-file";

const execFileAsync = promisify(execFile);

function refuse(): never {
	throw new TRPCError({
		code: "PRECONDITION_FAILED",
		message:
			"The previous agent's exit could not be verified. Exit it normally before choosing another account. Nothing was launched.",
	});
}

interface IdleTerminalDeps {
	listSessions: () => Promise<
		Array<{ id: string; alive: boolean; pid: number }>
	>;
	foregroundGroups: (pid: number) => Promise<string>;
}
const idleTerminalDeps: IdleTerminalDeps = {
	listSessions: async () => (await getDaemonClient()).list(),
	foregroundGroups: async (pid) =>
		(
			await execFileAsync(
				"/bin/ps",
				["-o", "tpgid=", "-o", "pgid=", "-p", String(pid)],
				{ timeout: 2000, maxBuffer: 4096 },
			)
		).stdout,
};

export async function assertAccountResumeTerminalIdle(
	db: HostDb,
	terminalId: string,
	workspaceId: string,
	deps: IdleTerminalDeps = idleTerminalDeps,
): Promise<void> {
	const terminal = db
		.select()
		.from(terminalSessions)
		.where(eq(terminalSessions.id, terminalId))
		.get();
	if (
		!terminal ||
		terminal.originWorkspaceId !== workspaceId ||
		(terminal.disposeRequestedAt !== null && terminal.status !== "disposed")
	)
		refuse();
	try {
		const session = (await deps.listSessions()).find(
			(item) => item.id === terminalId && item.alive,
		);
		if (!session) return;
		const groups = (await deps.foregroundGroups(session.pid))
			.trim()
			.split(/\s+/)
			.map(Number);
		if (
			groups.length !== 2 ||
			groups.some((group) => !Number.isSafeInteger(group) || group <= 0) ||
			groups[0] !== groups[1]
		)
			refuse();
	} catch {
		refuse();
	}
}

export async function readAccountResumeProcessStarts(
	pids: number[],
): Promise<Map<number, string>> {
	try {
		return await readProcessStarts(pids);
	} catch {
		refuse();
	}
}

/**
 * Native Claude records detect known writers; they are not an exclusive lock.
 * procStart has no documented timezone, so a live matching PID is conservatively
 * refused even when its birth text differs. PID reuse must not look like proof.
 */
export async function assertNoRecordedClaudeWriter(
	input: { sessionId: string; directories: string[] },
	processStarts = readAccountResumeProcessStarts,
): Promise<void> {
	if (process.platform !== "darwin" && process.platform !== "linux") refuse();
	const roots = new Set<string>();
	const records: Array<{ pid: number; start: string }> = [];
	let visited = 0;
	for (const directory of new Set(input.directories)) {
		let root: string;
		try {
			root = await realpath(join(directory, "sessions"));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
			refuse();
		}
		if (roots.has(root)) continue;
		roots.add(root);
		for (const entry of await readdir(root, { withFileTypes: true })) {
			if (++visited > 1024) refuse();
			if (!/^\d+\.json$/.test(entry.name)) continue;
			if (!entry.isFile()) refuse();
			const file = await readProfileFile(join(root, entry.name), 64 * 1024);
			if (!file) refuse();
			let record: Record<string, unknown>;
			try {
				record = JSON.parse(file.content);
			} catch {
				refuse();
			}
			if (!record || typeof record.sessionId !== "string") refuse();
			if (record.sessionId !== input.sessionId) continue;
			const start = processStartFingerprint(record.procStart);
			const pid = record.pid;
			if (
				typeof pid !== "number" ||
				!Number.isSafeInteger(pid) ||
				pid <= 0 ||
				pid > 2_147_483_647 ||
				entry.name !== `${pid}.json` ||
				!start ||
				record.pidDomain !== process.platform
			)
				refuse();
			records.push({ pid, start });
		}
	}
	const starts = await processStarts([
		...new Set(records.map((record) => record.pid)),
	]);
	if (records.some((record) => starts.has(record.pid)))
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"This conversation is still open in another Claude process. Exit it normally before choosing another account. Nothing was launched.",
		});
}
