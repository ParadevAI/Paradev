import {
	AGENT_SETUP_TARGETS,
	type AgentSetupTargetId,
	isAgentSetupTargetId,
	teardownAgents,
} from "@superset/agent-setup";
import { CLIError } from "@superset/cli-framework";

export interface RemoveAgentHooksResult {
	agents: AgentSetupTargetId[];
	failed: string[];
}

export function resolveAgentIds(options: {
	all?: boolean;
	agent?: readonly string[];
}): AgentSetupTargetId[] {
	const validIds = AGENT_SETUP_TARGETS.map((target) => target.id);
	const requested = options.agent ?? [];
	if (options.all && requested.length > 0) {
		throw new CLIError("Pass --all or --agent, not both");
	}
	if (options.all) return validIds;
	if (requested.length === 0) {
		throw new CLIError(
			"Pass --all or at least one --agent",
			`Agents: ${validIds.join(", ")}`,
		);
	}
	const unknown = requested.filter((id) => !isAgentSetupTargetId(id));
	if (unknown.length > 0) {
		throw new CLIError(
			`Unknown agent: ${unknown.join(", ")}`,
			`Agents: ${validIds.join(", ")}`,
		);
	}
	return [...new Set(requested as AgentSetupTargetId[])];
}

/** Agent-setup logs to stdout; keep it on stderr so `--json` output stays parsable. */
function withLogsOnStderr<T>(run: () => T): T {
	const log = console.log;
	console.log = console.error;
	try {
		return run();
	} finally {
		console.log = log;
	}
}

export function removeAgentHooks(
	options: { all?: boolean; agent?: readonly string[] },
	teardown: typeof teardownAgents = teardownAgents,
): RemoveAgentHooksResult {
	const agents = resolveAgentIds(options);
	const failed = withLogsOnStderr(() => teardown(agents));
	return { agents, failed };
}
