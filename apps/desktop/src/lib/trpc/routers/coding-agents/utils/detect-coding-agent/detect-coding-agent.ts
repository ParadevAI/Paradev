import {
	type AgentBinary,
	meetsMinVersion,
	parseAgentVersion,
	resolveAgentBinary,
} from "@superset/agent-setup/agent-binary";
import type { ManagedCodingAgent } from "@superset/agent-setup/managed-agent-binaries";
import {
	acpHarnessForPreset,
	cliFloor,
} from "@superset/host-service/acp-catalogue";
import type { RunResult } from "../run-process";

export interface CodingAgentStatus {
	installed: boolean;
	/** `path`: the user's own install, found on their PATH. `paradev`: the copy the app installed. */
	source: AgentBinary["source"] | null;
	path: string | null;
	version: string | null;
	/** The oldest version chat runs, as host-service checks before a chat starts. */
	minVersion: string;
	/** Installed and new enough for chat: the same answer host-service gives. */
	usable: boolean;
}

export interface DetectCodingAgentDeps {
	userPath: () => Promise<string>;
	run: (command: string, args: string[]) => Promise<RunResult>;
	resolve?: (binary: string, pathValue: string) => AgentBinary | null;
}

/**
 * An install on the user's PATH always wins over the app's own copy. Only
 * `--version` runs, so detecting creates no agent files.
 */
export async function detectCodingAgent(
	agent: ManagedCodingAgent,
	deps: DetectCodingAgentDeps,
): Promise<CodingAgentStatus> {
	const { minVersion } = cliFloor(acpHarnessForPreset(agent) ?? "");
	const binary = (deps.resolve ?? resolveAgentBinary)(
		agent,
		await deps.userPath(),
	);
	if (!binary) {
		return {
			installed: false,
			source: null,
			path: null,
			version: null,
			minVersion,
			usable: false,
		};
	}
	const version = await deps
		.run(binary.path, ["--version"])
		.then((result) => parseAgentVersion(result.stdout))
		.catch(() => null);
	return {
		installed: true,
		source: binary.source,
		path: binary.path,
		version,
		minVersion,
		usable: version !== null && meetsMinVersion(version, minVersion),
	};
}
