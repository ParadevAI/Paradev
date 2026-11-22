import { type AgentPidSource, PortManager } from "@superset/port-scanner";
import type { TerminalAgentStore } from "../terminal-agents/store.ts";
import { treeKillWithEscalation } from "./tree-kill.ts";

export const portManager = new PortManager({
	killFn: treeKillWithEscalation,
});

export const chatPortTerminalIds = new Set<string>();

/** A chat session pid is its agent. A terminal agent launch id starts with the wrapper pid. */
export function agentPidSource(
	store: Pick<TerminalAgentStore, "get">,
): AgentPidSource {
	return (terminalId, sessionPid) => {
		if (chatPortTerminalIds.has(terminalId)) return sessionPid;
		const launchPid = Number.parseInt(
			store.get(terminalId)?.launchId ?? "",
			10,
		);
		return launchPid > 0 ? launchPid : null;
	};
}
