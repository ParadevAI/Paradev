import { agentStatusFromEvent } from "@superset/shared/agent-status";
import type { TerminalAgentBinding } from "../../terminal-agents/types";

export function bindingNeedsKeepAwake(binding: TerminalAgentBinding): boolean {
	if (binding.endedAt !== undefined) return false;
	return (
		agentStatusFromEvent(binding.lastEventType) === "working" ||
		(binding.subagents?.some((agent) => agent.endedAt === undefined) ??
			false) ||
		(binding.backgroundTasks?.some(
			(task) =>
				task.kind === "process" ||
				task.subagentStatus === undefined ||
				task.subagentStatus === "running",
		) ??
			false)
	);
}
