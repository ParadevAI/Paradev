import type { AgentCliStatus } from "@superset/shared/agent-cli-status";
import { coerce, lt } from "semver";
import { ACP_HARNESSES, UNGATED_VERSION } from "./acpCatalogue";
import { meetsFloor, probeAgentCli } from "./agentCli";
import { resolveAgentCliUpdate } from "./agentCliUpdate";
import { type LatestCliVersion, latestCliVersion } from "./latestCliVersion";

function isOlder(installed: string, latest: string): boolean {
	const current = coerce(installed);
	const newest = coerce(latest);
	return current !== null && newest !== null && lt(current, newest);
}

/**
 * Null for a harness whose CLI has no update table: those keep the version
 * floor alone.
 */
export async function agentCliStatus(options: {
	harness: string;
	env: NodeJS.ProcessEnv;
	latest?: LatestCliVersion;
}): Promise<AgentCliStatus | null> {
	const entry = ACP_HARNESSES[options.harness];
	if (!entry) return null;
	const probed = await probeAgentCli(entry.binary, options.env);
	const update = resolveAgentCliUpdate({
		binary: entry.binary,
		found: probed.found,
		runMode: process.env.SUPERSET_HOST_RUN_MODE,
	});
	if (!update) return null;
	const installed = probed.version;
	const lookup = options.latest ?? latestCliVersion;
	const latest =
		installed && update.latest ? await lookup(update.latest) : null;
	const minVersion =
		entry.minVersion === UNGATED_VERSION ? null : entry.minVersion;
	return {
		binary: entry.binary,
		installed,
		minVersion,
		belowFloor:
			installed !== null &&
			minVersion !== null &&
			!meetsFloor(installed, minVersion),
		latest,
		behind: installed !== null && latest !== null && isOlder(installed, latest),
		source: update.source,
		updateCommand: update.command,
	};
}
