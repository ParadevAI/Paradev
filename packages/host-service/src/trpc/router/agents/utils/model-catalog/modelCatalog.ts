import {
	type AgentModelCatalog,
	getAgentModelSupport,
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

const catalogs = new AgentModelCatalogCache();

type CatalogConfig = Pick<
	ResolvedHostAgentConfig,
	"id" | "presetId" | "command" | "env"
>;

function cacheKey(db: HostDb, config: CatalogConfig): string {
	const env = agentLaunchEnv(db, config);
	return JSON.stringify([config.id, config.command, env]);
}

function launchPresetIdOf(config: CatalogConfig): string {
	return resolveAgentLaunchPresetId(config.presetId, config.command);
}

export function peekAgentModelCatalog(
	db: HostDb,
	config: CatalogConfig,
): AgentModelCatalog | null {
	return catalogs.peek(cacheKey(db, config));
}

export async function loadAgentModelCatalog(
	db: HostDb,
	config: CatalogConfig,
): Promise<AgentModelCatalog | null> {
	const presetId = launchPresetIdOf(config);
	if (presetId !== "codex") return null;
	return catalogs.load(cacheKey(db, config), () => {
		const env = { ...process.env, ...agentLaunchEnv(db, config) };
		const [executable = presetId] = config.command.trim().split(/\s+/);
		const command = /[\\/]/.test(executable)
			? executable
			: agentCliCommand(executable, env);
		return discoverCodexModels({
			command,
			env,
			timeoutMs: DISCOVERY_TIMEOUT_MS,
		});
	});
}

export async function prepareAgentModelCatalog(
	db: HostDb,
	input: { agent: string; model?: string; effort?: string },
): Promise<void> {
	if (!input.model && !input.effort) return;
	const config = resolveHostAgentConfig(db, input.agent);
	if (!config) return;
	if (!getAgentModelSupport(launchPresetIdOf(config))?.liveCatalog) return;
	await loadAgentModelCatalog(db, config);
}
