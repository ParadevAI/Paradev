import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import {
	isExecutableFile,
	meetsMinVersion,
	parseAgentVersion,
	resolveAgentBinary,
} from "@superset/agent-setup/agent-binary";
import { getBinDir } from "@superset/agent-setup/paths";
import { UNGATED_VERSION } from "./acpCatalogue";

const execFileAsync = promisify(execFile);

const VERSION_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60_000;

export type AgentCli = {
	command: string;
	env: NodeJS.ProcessEnv;
};

function supersetWrapper(binary: string): string | null {
	if (process.platform === "win32") return null;
	const wrapper = join(getBinDir(), binary);
	return isExecutableFile(wrapper) ? wrapper : null;
}

/** The wrapper when there is one: it finds the agent the same way, then adds hooks. */
export function agentCliCommand(
	binary: string,
	env: NodeJS.ProcessEnv,
): string {
	return (
		supersetWrapper(binary) ??
		resolveAgentBinary(binary, env.PATH ?? "")?.path ??
		binary
	);
}

const cache = new Map<string, { at: number; version: string | null }>();

async function probeVersion(
	command: string,
	env: NodeJS.ProcessEnv,
): Promise<string | null> {
	const hit = cache.get(command);
	if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.version;
	let version: string | null = null;
	try {
		const { stdout, stderr } = await execFileAsync(command, ["--version"], {
			env,
			timeout: VERSION_TIMEOUT_MS,
		});
		version = parseAgentVersion(stdout) ?? parseAgentVersion(stderr);
	} catch {
		version = null;
	}
	// A miss is not kept: the app can install the agent a moment later.
	if (version) cache.set(command, { at: Date.now(), version });
	return version;
}

export function clearAgentCliCache(): void {
	cache.clear();
}

export function agentCliUnsupported(options: {
	binary: string;
	minVersion: string;
	found: string | null;
	upgrade?: string;
}): string {
	const upgrade = options.upgrade ? ` Upgrade with: ${options.upgrade}` : "";
	const wanted =
		UNGATED_VERSION === options.minVersion
			? ""
			: ` ${options.minVersion} or newer`;
	if (!options.found) {
		return (
			`${options.binary} was not found, so this chat cannot start. Install` +
			` ${options.binary}${wanted} and make sure it is on your PATH.${upgrade}`
		);
	}
	return `${options.binary} ${options.minVersion} or newer is needed for chat, and ${options.found} is installed.${upgrade}`;
}

export async function resolveAgentCli(options: {
	binary: string;
	minVersion: string;
	upgrade?: string;
	env: () => Promise<NodeJS.ProcessEnv>;
}): Promise<AgentCli> {
	const env = await options.env();
	const command = agentCliCommand(options.binary, env);
	const found = await probeVersion(command, env);
	if (
		!found ||
		(options.minVersion !== UNGATED_VERSION &&
			!meetsMinVersion(found, options.minVersion))
	) {
		throw new Error(agentCliUnsupported({ ...options, found }));
	}
	return { command, env };
}
