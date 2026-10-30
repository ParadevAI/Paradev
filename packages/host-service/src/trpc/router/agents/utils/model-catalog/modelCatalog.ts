import {
	type AgentModelCatalog,
	getAgentModelSupport,
	isCuratedAgentModel,
	resolveAgentLaunchPresetId,
} from "@superset/shared/agent-models";
import { agentCliCommand } from "../../../../../chat-v3/agentCli";
import type { HostDb } from "../../../../../db";
import {
	agentLaunchEnv,
	type ResolvedHostAgentConfig,
	resolveHostAgentConfig,
} from "../../../../../terminal-agents/agent-config";
import { AgentModelCatalogCache } from "./AgentModelCatalogCache";
import { discoverCodexModels } from "./discoverCodexModels";

const DISCOVERY_TIMEOUT_MS = 15_000;

type Discover = (cli: {
	command: string;
	env: NodeJS.ProcessEnv;
}) => Promise<AgentModelCatalog>;

const DISCOVERERS: Readonly<Record<string, Discover>> = {
	codex: (cli) =>
		discoverCodexModels({ ...cli, timeoutMs: DISCOVERY_TIMEOUT_MS }),
};

const catalogs = new AgentModelCatalogCache({
	ttlMs: 10 * 60_000,
	failureTtlMs: 60_000,
});

type CatalogConfig = Pick<
	ResolvedHostAgentConfig,
	"id" | "presetId" | "command" | "env"
>;

function cacheKey(config: CatalogConfig): string {
	return `${config.id}\0${config.command}`;
}

function launchPresetIdOf(config: CatalogConfig): string {
	return resolveAgentLaunchPresetId(config.presetId, config.command);
}

/** The live catalog last read for this config, or null when none is cached. */
export function peekAgentModelCatalog(
	config: CatalogConfig,
): AgentModelCatalog | null {
	return catalogs.peek(cacheKey(config));
}

/**
 * Read the config's model list from its installed CLI, under the env its
 * launch uses so an agent pinned to another account lists that account's
 * models. Null when the agent has no live catalog or the read failed.
 */
export async function loadAgentModelCatalog(
	db: HostDb,
	config: CatalogConfig,
): Promise<AgentModelCatalog | null> {
	const presetId = launchPresetIdOf(config);
	const discover = DISCOVERERS[presetId];
	if (!discover || !getAgentModelSupport(presetId)?.liveCatalog) return null;
	return catalogs.load(cacheKey(config), () => {
		const env = { ...process.env, ...agentLaunchEnv(db, config) };
		const [executable = presetId] = config.command.trim().split(/\s+/);
		const command = /[\\/]/.test(executable)
			? executable
			: agentCliCommand(executable, env);
		return discover({ command, env });
	});
}

/**
 * Make sure validation can see a model only the live catalog lists. Launch
 * validation is synchronous, so the async entry points call this first; a
 * curated or absent model needs no read.
 */
export async function prepareAgentModelCatalog(
	db: HostDb,
	input: { agent: string; model?: string },
): Promise<void> {
	if (!input.model) return;
	const config = resolveHostAgentConfig(db, input.agent);
	if (!config) return;
	if (isCuratedAgentModel(launchPresetIdOf(config), input.model)) return;
	await loadAgentModelCatalog(db, config);
}
