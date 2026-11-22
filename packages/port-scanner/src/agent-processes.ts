import path from "node:path";
import type { ProcessTableEntry } from "./scanner.ts";

const SHELLS = new Set(["bash", "sh", "zsh"]);

/**
 * Agent processes and their ancestors. Killing any of these kills an agent.
 *
 * An agent pid is the process that runs the agent or the wrapper that
 * launched it. A wrapper that is still a shell did not exec the agent, so
 * the agent is one of its children.
 */
export function findAgentAncestry(
	table: ProcessTableEntry[],
	agentPids: number[],
	argv0: Map<number, string>,
): Set<number> {
	const parents = new Map(table.map(({ pid, ppid }) => [pid, ppid]));
	const launchers = new Set(
		agentPids.filter((pid) => SHELLS.has(path.basename(argv0.get(pid) ?? ""))),
	);
	const agents = new Set(agentPids);
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
