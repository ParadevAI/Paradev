export type AgentJobStatus =
	| "running"
	| "done"
	| "failed"
	| "killed"
	| "timed_out"
	| "lost";

export interface AgentJobMeta {
	jobId: string;
	callId: string;
	sessionId: string;
	workspaceId: string;
	cwd: string;
	command: string;
	description: string | null;
	pid: number | null;
	status: AgentJobStatus;
	exitCode: number | null;
	startedAt: string;
	endedAt: string | null;
	bodyBytes: number;
	logPath: string;
}

export const JOB_LOG_FIELD_WIDTHS = { status: 9, runningForMs: 12 } as const;

export interface JobHeader {
	text: string;
	statusAt: number;
	runningForAt: number;
}

export function formatJobHeader(
	meta: AgentJobMeta,
	runningForMs: number,
): JobHeader {
	const before = [
		"---",
		`pid: ${meta.pid ?? ""}`,
		`cwd: ${JSON.stringify(meta.cwd)}`,
		`command: ${JSON.stringify(meta.command)}`,
		`description: ${JSON.stringify(meta.description ?? "")}`,
		"status: ",
	].join("\n");
	const status = meta.status.padEnd(JOB_LOG_FIELD_WIDTHS.status);
	const middle = `\nstarted_at: ${meta.startedAt}\nrunning_for_ms: `;
	const runningFor = String(runningForMs).padEnd(
		JOB_LOG_FIELD_WIDTHS.runningForMs,
	);
	const text = `${before}${status}${middle}${runningFor}\n---\n`;
	const statusAt = Buffer.byteLength(before);
	const runningForAt =
		statusAt + Buffer.byteLength(status) + Buffer.byteLength(middle);
	return { text, statusAt, runningForAt };
}

export function formatJobFooter(
	exitCode: number | null,
	elapsedMs: number,
): string {
	return `\n---\nexit_code: ${exitCode ?? ""}\nelapsed_ms: ${elapsedMs}\n---\n`;
}
