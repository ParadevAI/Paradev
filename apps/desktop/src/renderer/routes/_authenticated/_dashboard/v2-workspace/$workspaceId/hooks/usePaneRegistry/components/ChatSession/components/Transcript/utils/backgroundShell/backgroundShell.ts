import type { BackgroundTask, ToolCall } from "@superset/chat/protocol";

export type BackgroundShellStatus =
	| "running"
	| "finished"
	| "failed"
	| "stopped";

export type BackgroundShell = {
	taskId: string | null;
	command: string;
	status: BackgroundShellStatus;
	startedAtMs: number;
	endedAtMs: number | null;
	exitCode: number | null;
	canStop: boolean;
};

const CLAUDE_TASK_ID = /running in background with ID: (\S+?)\.?(?:\s|$)/;

function input(tool: ToolCall): {
	command?: unknown;
	run_in_background?: unknown;
} {
	return (tool.rawInput ?? {}) as {
		command?: unknown;
		run_in_background?: unknown;
	};
}

function piShellId(tool: ToolCall): string | null {
	const shellId = (
		tool.rawOutput as { details?: { shellId?: unknown } } | undefined
	)?.details?.shellId;
	return typeof shellId === "string" && shellId ? shellId : null;
}

function claudeTaskId(tool: ToolCall): string | null {
	for (const content of tool.content) {
		if (content.type !== "text") continue;
		const match = content.text.match(CLAUDE_TASK_ID);
		if (match?.[1]) return match[1];
	}
	return null;
}

export function isBackgroundShell(tool: ToolCall): boolean {
	if (tool.subagent === true) return false;
	return (
		tool.background !== undefined ||
		input(tool).run_in_background === true ||
		(piShellId(tool) !== null && tool.title === "bash_background")
	);
}

export function backgroundShell(
	tool: ToolCall,
	liveTasks: ReadonlyMap<string, BackgroundTask> | null,
): BackgroundShell {
	const record = tool.background;
	const taskId = record?.taskId ?? piShellId(tool) ?? claudeTaskId(tool);
	const live = taskId ? liveTasks?.get(taskId) : undefined;
	const command = input(tool).command;
	const base = {
		taskId,
		command: typeof command === "string" && command ? command : tool.title,
		startedAtMs: record?.startedAtMs ?? tool.startedAtMs,
		canStop: live?.canStop === true,
	};
	if (live)
		return { ...base, status: "running", endedAtMs: null, exitCode: null };
	if (tool.status === "running")
		return {
			...base,
			status: liveTasks ? "running" : "stopped",
			endedAtMs: null,
			exitCode: null,
		};
	if (tool.status === "failed")
		return {
			...base,
			status: "failed",
			endedAtMs: tool.completedAtMs ?? null,
			exitCode: null,
		};
	if (!record || record.status === "running")
		return {
			...base,
			status: record ? "stopped" : "finished",
			endedAtMs: null,
			exitCode: null,
		};
	return {
		...base,
		status: record.status === "completed" ? "finished" : record.status,
		endedAtMs: record.completedAtMs ?? null,
		exitCode: record.exitCode ?? null,
	};
}
