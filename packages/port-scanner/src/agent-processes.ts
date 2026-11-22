import path from "node:path";
import type { ProcessTableEntry } from "./scanner.ts";

const SHELLS = new Set(["bash", "sh", "zsh"]);

/** The process that started an agent. When `agentIsChild`, the agent is one of its children. */
export interface AgentLaunch {
	pid: number;
	agentIsChild: boolean;
}

/**
 * Agent processes and their ancestors. Killing any of these kills an agent.
 *
 * A launch pid that is still a shell is a wrapper that did not exec, so the
 * agent is one of its children too.
 */
export function findAgentAncestry(
	table: ProcessTableEntry[],
	launches: AgentLaunch[],
	argv0: Map<number, string>,
): Set<number> {
	const parents = new Map(table.map(({ pid, ppid }) => [pid, ppid]));
	const launchers = new Set(
		launches
			.filter(
				({ pid, agentIsChild }) =>
					agentIsChild || SHELLS.has(path.basename(argv0.get(pid) ?? "")),
			)
			.map(({ pid }) => pid),
	);
	const agents = new Set(launches.map(({ pid }) => pid));
	for (const { pid, ppid } of table) if (launchers.has(ppid)) agents.add(pid);
	const ancestry = new Set<number>();
	for (const agent of agents) {
		for (
			let pid: number | undefined = agent;
			pid !== undefined && pid > 1 && !ancestry.has(pid);
			pid = parents.get(pid)
		)
			ancestry.add(pid);
	}
	return ancestry;
}
