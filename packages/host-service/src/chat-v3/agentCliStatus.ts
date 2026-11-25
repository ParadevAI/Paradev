import type { AgentCliStatus } from "@superset/shared/agent-cli-status";
import { coerce, lt, valid } from "semver";
import { ACP_HARNESSES, UNGATED_VERSION } from "./acpCatalogue";
import { meetsFloor, probeAgentCli } from "./agentCli";
import { hasAgentCliUpdates, resolveAgentCliUpdate } from "./agentCliUpdate";
import { type LatestCliVersion, latestCliVersion } from "./latestCliVersion";

function isOlder(installed: string, latest: string): boolean {
	const current = valid(installed) ?? coerce(installed);
	const newest = valid(latest) ?? coerce(latest);
	return current !== null && newest !== null && lt(current, newest);
}

const LATEST_WAIT_MS = 250;
const PENDING = Symbol("pending");

function settledWithin<T>(
	promise: Promise<T>,
	ms: number,
): Promise<T | typeof PENDING> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => resolve(PENDING), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error: unknown) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});
}

export function hasAgentCliStatus(harness: string): boolean {
	const entry = ACP_HARNESSES[harness];
	return entry !== undefined && hasAgentCliUpdates(entry.binary);
}

/**
 * Null for a harness whose CLI has no update table: those keep the version
 * floor alone. The floor answer gates chat recovery, so it does not wait for
 * the newest-release lookup: a slow one reads `latestPending`.
 */
export async function agentCliStatus(options: {
	harness: string;
	env: NodeJS.ProcessEnv;
	latest?: LatestCliVersion;
	latestWaitMs?: number;
}): Promise<AgentCliStatus | null> {
	const entry = ACP_HARNESSES[options.harness];
	if (!entry || !hasAgentCliUpdates(entry.binary)) return null;
	const probed = await probeAgentCli(entry.binary, options.env);
	const update = resolveAgentCliUpdate({
		binary: entry.binary,
		found: probed.found,
		runMode: process.env.SUPERSET_HOST_RUN_MODE,
	});
	if (!update) return null;
	const installed = probed.version;
	const lookup = options.latest ?? latestCliVersion;
	const looked =
		installed && update.latest
			? await settledWithin(
					lookup(update.latest),
					options.latestWaitMs ?? LATEST_WAIT_MS,
				)
			: null;
	const latest = looked === PENDING ? null : looked;
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
		latestPending: looked === PENDING,
		behind: installed !== null && latest !== null && isOlder(installed, latest),
		source: update.source,
		updateCommand: update.command,
	};
}
