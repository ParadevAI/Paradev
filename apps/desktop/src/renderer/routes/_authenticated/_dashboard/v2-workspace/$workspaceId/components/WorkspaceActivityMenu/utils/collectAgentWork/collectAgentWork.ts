import type { BackgroundTask } from "@superset/chat/protocol";

export type AgentWork = {
	key: string;
	kind: "subagent" | "shell";
	name: string;
	step?: string;
	startedAtMs: number;
	terminalId: string;
	taskId: string;
	sessionId?: string;
	agentSessionId?: string;
	canStop: boolean;
	canBackground: boolean;
	nested: number;
};

export type AgentBinding = {
	terminalId: string;
	chatSessionId?: string;
	agentSessionId?: string;
	endedAt?: number | null;
	backgroundTasks?: readonly BackgroundTask[];
	subagents?: readonly { id: string; agentType?: string; startedAt: number }[];
};

const isRunning = (task: BackgroundTask) =>
	task.subagentStatus === undefined || task.subagentStatus === "running";

function chatWork(binding: AgentBinding, sessionId: string): AgentWork[] {
	const tasks = (binding.backgroundTasks ?? []).filter(
		(task) => task.kind !== "subagent" || isRunning(task),
	);
	const subagents = new Map(
		tasks
			.filter((task) => task.kind === "subagent")
			.map((task) => [task.id, task]),
	);
	const nested = new Map<string, number>();
	const topOf = (task: BackgroundTask) => {
		if (task.kind !== "subagent") return task;
		let top = task;
		const seen = new Set<string>();
		while (top.parentId && subagents.has(top.parentId) && !seen.has(top.id)) {
			seen.add(top.id);
			top = subagents.get(top.parentId) ?? top;
		}
		return top;
	};
	for (const task of tasks) {
		const top = topOf(task);
		if (top !== task) nested.set(top.id, (nested.get(top.id) ?? 0) + 1);
	}
	return tasks
		.filter((task) => topOf(task) === task)
		.map((task) => ({
			key: `${binding.terminalId}:${task.id}`,
			kind: task.kind === "subagent" ? "subagent" : "shell",
			name: task.name,
			...(task.detail ? { step: task.detail } : {}),
			startedAtMs: task.startedAtMs,
			terminalId: binding.terminalId,
			taskId: task.id,
			sessionId,
			canStop: task.canStop,
			canBackground: task.canBackground === true,
			nested: nested.get(task.id) ?? 0,
		}));
}

function terminalWork(binding: AgentBinding): AgentWork[] {
	return (binding.subagents ?? []).map((subagent) => ({
		key: `${binding.terminalId}:${subagent.id}`,
		kind: "subagent",
		name: subagent.agentType ?? "",
		startedAtMs: subagent.startedAt,
		terminalId: binding.terminalId,
		taskId: subagent.id,
		...(binding.agentSessionId
			? { agentSessionId: binding.agentSessionId }
			: {}),
		canStop: false,
		canBackground: false,
		nested: 0,
	}));
}

const runningSubagentKeys = (binding: AgentBinding): string[] =>
	binding.chatSessionId
		? (binding.backgroundTasks ?? [])
				.filter((task) => task.kind === "subagent" && isRunning(task))
				.map((task) => `${binding.terminalId}:${task.id}`)
		: (binding.subagents ?? []).map(
				(subagent) => `${binding.terminalId}:${subagent.id}`,
			);

export function collectAgentWork(bindings: Iterable<AgentBinding>): {
	subagents: AgentWork[];
	shells: AgentWork[];
	runningKeys: ReadonlySet<string>;
} {
	const live = [...bindings].filter((binding) => !binding.endedAt);
	const work = live
		.flatMap((binding) =>
			binding.chatSessionId
				? chatWork(binding, binding.chatSessionId)
				: terminalWork(binding),
		)
		.sort((a, b) => a.startedAtMs - b.startedAtMs);
	return {
		subagents: work.filter((item) => item.kind === "subagent"),
		shells: work.filter((item) => item.kind === "shell"),
		runningKeys: new Set(live.flatMap(runningSubagentKeys)),
	};
}
