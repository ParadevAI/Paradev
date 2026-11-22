import { type AgentPidSource, PortManager } from "@superset/port-scanner";
import type { TerminalAgentStore } from "../terminal-agents/store.ts";
import { treeKillWithEscalation } from "./tree-kill.ts";

export const portManager = new PortManager({
	killFn: treeKillWithEscalation,
});

/** Chat terminal id → whether its session pid is an ACP adapter that runs the agent as a child. */
export const chatPortTerminals = new Map<string, { agentIsChild: boolean }>();

/** A terminal agent launch id starts with the wrapper pid. */
export function agentPidSource(
	store: Pick<TerminalAgentStore, "get">,
): AgentPidSource {
	return (terminalId, sessionPid) => {
		const chat = chatPortTerminals.get(terminalId);
		if (chat) return { pid: sessionPid, agentIsChild: chat.agentIsChild };
		const launchPid = Number.parseInt(
			store.get(terminalId)?.launchId ?? "",
			10,
		);
		return launchPid > 0 ? { pid: launchPid, agentIsChild: false } : null;
	};
}
