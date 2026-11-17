import { agentIsBusy } from "../page-watch/index.ts";
import type { TerminalAgentBinding } from "../terminal-agents/types.ts";

/**
 * A background process such as a dev server does not count as busy: it can
 * run for hours and a fix does not race it.
 */
export function isAgentBusyForAutoFix(binding: TerminalAgentBinding): boolean {
	return (
		agentIsBusy(binding.lastEventType) ||
		(binding.queuedPrompts ?? 0) > 0 ||
		(binding.subagents?.length ?? 0) > 0 ||
		(binding.backgroundTasks ?? []).some((task) => task.kind === "subagent")
	);
}
