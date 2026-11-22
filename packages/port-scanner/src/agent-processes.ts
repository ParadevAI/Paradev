import path from "node:path";
import type { ProcessTableEntry } from "./scanner.ts";

const SHELLS = new Set(["bash", "sh", "zsh"]);
const MAX_LAUNCHER_DEPTH = 3;

/** The process that started an agent. When `agentIsChild`, the agent is one of its children. */
export interface AgentLaunch {
	pid: number;
	agentIsChild: boolean;
}

function childrenByParent(table: ProcessTableEntry[]): Map<number, number[]> {
	const children = new Map<number, number[]>();
	for (const { pid, ppid } of table) {
		const siblings = children.get(ppid);
		if (siblings) siblings.push(pid);
		else children.set(ppid, [pid]);
	}
	return children;
}

/** The processes whose argv0 `findAgentAncestry` reads to find launchers. */
export function launcherCandidates(
	table: ProcessTableEntry[],
	launches: AgentLaunch[],
): number[] {
	const children = childrenByParent(table);
	const candidates = new Set<number>();
	let level = launches.map(({ pid }) => pid);
	for (let depth = 0; depth <= MAX_LAUNCHER_DEPTH; depth++) {
		for (const pid of level) candidates.add(pid);
		level = level.flatMap((pid) => children.get(pid) ?? []);
	}
	return [...candidates];
}

/**
 * Agent processes and their ancestors. Killing any of these kills an agent.
 *
 * A launcher runs the agent as its child: a chat's ACP adapter, a wrapper
 * shell that did not exec, or a `node` shim that a wrapper shell started
 * (npm Codex on Node without `process.execve` spawns the native binary).
 */
export function findAgentAncestry(
	table: ProcessTableEntry[],
	launches: AgentLaunch[],
	argv0: Map<number, string>,
): Set<number> {
	const parents = new Map(table.map(({ pid, ppid }) => [pid, ppid]));
	const children = childrenByParent(table);
	const name = (pid: number) => path.basename(argv0.get(pid) ?? "");
	const agents = new Set<number>();
	const addAgent = (pid: number, isLauncher: boolean, depth: number) => {
		agents.add(pid);
		if (!isLauncher || depth >= MAX_LAUNCHER_DEPTH) return;
		const startedByShell = SHELLS.has(name(pid));
		for (const child of children.get(pid) ?? [])
			addAgent(
				child,
				SHELLS.has(name(child)) || (startedByShell && name(child) === "node"),
				depth + 1,
			);
	};
	for (const { pid, agentIsChild } of launches)
		addAgent(pid, agentIsChild || SHELLS.has(name(pid)), 0);

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
