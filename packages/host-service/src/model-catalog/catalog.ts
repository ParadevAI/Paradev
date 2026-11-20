import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { promisify, stripVTControlCharacters } from "node:util";
import type { SessionConfigOption } from "@superset/chat/protocol";
import { createAcpAdapter } from "@superset/chat-runtime";
import type {
	AgentModelCatalog,
	CatalogModel,
} from "@superset/shared/agent-models";
import {
	DEFAULT_ALIAS_MODEL_ID,
	getAgentModelSupport,
	resolveAgentLaunchPresetId,
	runtimeDefaultModel,
	uniqueModels,
} from "@superset/shared/agent-models";
import { eq } from "drizzle-orm";
import { acpHarnessForPreset } from "../chat-v3/acpCatalogue";
import { acpHarnessFactory } from "../chat-v3/acpHarnesses";
import { type AcpLaunch, resolveAcpLaunch } from "../chat-v3/acpLaunch";
import { agentCliCommand } from "../chat-v3/agentCli";
import type { HostDb } from "../db";
import { workspaces } from "../db/schema";
import { getProjectIncludingDeleted } from "../projects/local-project-store";
import { waitForSandboxManagedEnv } from "../runtime/sandbox-managed-env";
import { buildHostLaunchEnv, waitForTerminalBaseEnv } from "../terminal/env";
import {
	agentLaunchEnv,
	chatLaunchPresetId,
	resolveHostAgentConfig,
} from "../terminal-agents/agent-config";
import { ModelCatalogCache } from "./cache";
import { discoverCodexModels } from "./codex";
import {
	abortable,
	DISCOVERY_DEADLINE_MS,
	DiscoveryError,
	DiscoveryScheduler,
	discoveryFailure,
} from "./discovery";
import { enrichModels, refreshModelMetadata } from "./metadata";

const execFileAsync = promisify(execFile);
const caches = new WeakMap<HostDb, ModelCatalogCache>();
const scheduler = new DiscoveryScheduler();

async function context(
	db: HostDb,
	agent: string,
	surface: "chat" | "terminal",
	workspaceId?: string,
	projectId?: string,
	signal?: AbortSignal,
) {
	const config = resolveHostAgentConfig(db, agent);
	if (!config) throw new Error("Unknown agent config");
	const workspace = workspaceId
		? db.query.workspaces
				.findFirst({ where: eq(workspaces.id, workspaceId) })
				.sync()
		: undefined;
	if (workspaceId && (!workspace || workspace.archivedAt))
		throw new Error("Unknown workspace");
	const project = getProjectIncludingDeleted(
		db,
		workspace?.projectId ?? projectId ?? "",
	);
	if (projectId && (!project || project.deletedAt))
		throw new Error("Unknown project");
	const cwd = workspace?.worktreePath ?? project?.repoPath ?? homedir();
	await Promise.all([waitForTerminalBaseEnv(), waitForSandboxManagedEnv()]);
	signal?.throwIfAborted();
	const presetId =
		surface === "chat"
			? chatLaunchPresetId(config)
			: resolveAgentLaunchPresetId(config.presetId, config.command);
	const env = {
		...buildHostLaunchEnv({
			cwd,
			workspaceId: workspaceId ?? "",
			workspacePath: cwd,
			rootPath: project?.repoPath ?? cwd,
		}),
		...agentLaunchEnv(db, config),
	};
	const harness = acpHarnessForPreset(presetId);
	const options = {
		harness: harness ?? "",
		cwd,
		scopeId: workspaceId ?? "",
		sessionId: `model-discovery-${crypto.randomUUID()}`,
		agentConfigId: config.id,
	};
	const launch: AcpLaunch | undefined =
		surface === "chat" && harness
			? await resolveAcpLaunch(db, options, projectId, signal)
			: undefined;
	const command = launch?.command ?? agentCliCommand(config.command, env);
	let executableRevision: number | undefined;
	try {
		executableRevision = statSync(command).mtimeMs;
	} catch {}
	const key = createHash("sha256")
		.update(
			JSON.stringify([
				config,
				surface,
				cwd,
				launch ?? env,
				command,
				executableRevision,
			]),
		)
		.digest("hex");
	return { config, cwd, presetId, env, key, launch, options };
}

/** Pickers add their own "Default" choice, which omits the model override. */
export function withoutDefaultAlias(models: CatalogModel[]): CatalogModel[] {
	return models.filter((model) => model.id !== DEFAULT_ALIAS_MODEL_ID);
}

export function parseCursorModels(output: string): CatalogModel[] {
	const plain = stripVTControlCharacters(output);
	return uniqueModels(
		plain.split(/\r?\n/).flatMap((line) => {
			const match = /^([\w./:@+-]+)\s+-\s+(.+)$/.exec(line.trim());
			return match?.[1]
				? [
						{
							id: match[1] ?? "",
							label: (match[2] ?? match[1] ?? "").replace(
								/\s+\(current\)$/,
								"",
							),
						},
					]
				: [];
		}),
	);
}

export async function discoverAgentModels(
	db: HostDb,
	input: {
		agent: string;
		surface: "chat" | "terminal";
		workspaceId?: string;
		projectId?: string;
		refresh?: boolean;
	},
): Promise<AgentModelCatalog> {
	const fallback = (): AgentModelCatalog => ({
		models:
			getAgentModelSupport(
				resolveHostAgentConfig(db, input.agent)?.presetId ?? input.agent,
			)?.models ?? [],
		source: "bundled",
		availability: "unknown",
		stale: true,
		fetchedAt: Date.now(),
	});
	try {
		return await scheduler.run(async (signal) => {
			const ctx = await abortable(
				context(
					db,
					input.agent,
					input.surface,
					input.workspaceId,
					input.projectId,
					signal,
				),
				signal,
			);
			signal.throwIfAborted();
			refreshModelMetadata();
			let cache = caches.get(db);
			if (!cache) {
				cache = new ModelCatalogCache();
				caches.set(db, cache);
			}
			const catalog = await cache.get(
				ctx.key,
				() =>
					(async (): Promise<AgentModelCatalog> => {
						let models: CatalogModel[] | undefined;
						let defaultModel: AgentModelCatalog["defaultModel"];
						const readModelOption = (options: SessionConfigOption[]) => {
							const option = options.find(
								(entry) => entry.category === "model",
							);
							models = option?.options;
							defaultModel = option
								? runtimeDefaultModel(option.options, option.currentValue)
								: undefined;
						};
						const harness = acpHarnessForPreset(ctx.presetId);
						if (input.surface === "chat" && harness && ctx.launch) {
							const factory = acpHarnessFactory(
								harness,
								db,
								async () => null,
								undefined,
								{ launch: ctx.launch, startupTimeoutMs: DISCOVERY_DEADLINE_MS },
							);
							const adapter = factory?.(ctx.options);
							if (adapter) {
								try {
									readModelOption(
										await abortable(
											adapter.discoverModels?.(ctx.cwd) ?? Promise.resolve([]),
											signal,
										),
									);
								} finally {
									await adapter.dispose();
								}
							}
						} else if (
							input.surface === "terminal" &&
							ctx.presetId === "opencode"
						) {
							const adapter = createAcpAdapter({
								command: agentCliCommand(ctx.config.command, ctx.env),
								args: ["acp"],
								env: ctx.env,
								cwd: ctx.cwd,
								startupTimeoutMs: DISCOVERY_DEADLINE_MS,
							});
							try {
								readModelOption(
									await abortable(
										adapter.discoverModels?.(ctx.cwd) ?? Promise.resolve([]),
										signal,
									),
								);
							} finally {
								await adapter.dispose();
							}
						} else if (ctx.presetId === "codex") {
							models = await discoverCodexModels(
								{
									command: agentCliCommand(ctx.config.command, ctx.env),
									env: ctx.env,
									cwd: ctx.cwd,
								},
								signal,
							);
						} else if (
							input.surface === "terminal" &&
							ctx.presetId === "cursor-agent"
						) {
							const command = agentCliCommand(ctx.config.command, ctx.env);
							const { stdout } = await execFileAsync(
								command,
								["--list-models"],
								{
									env: ctx.env,
									cwd: ctx.cwd,
									timeout: 10_000,
									maxBuffer: 4 * 1024 * 1024,
									signal,
								},
							);
							models = parseCursorModels(stdout);
							if (!models.length)
								throw new Error("Model listing was not recognized");
						}
						if (models === undefined) throw new DiscoveryError("unsupported");
						return {
							models: withoutDefaultAlias(uniqueModels(models)),
							defaultModel,
							source:
								input.surface === "chat" || ctx.presetId === "opencode"
									? "runtime"
									: "cli",
							availability: "reported",
							fetchedAt: Date.now(),
							stale: false,
						};
					})().catch((error) => {
						if (discoveryFailure(error) === "unsupported") throw error;
						console.warn("[model-discovery] failed", {
							agent: input.agent,
							surface: input.surface,
							error,
						});
						throw error;
					}),
				() => ({
					models: getAgentModelSupport(ctx.presetId)?.models ?? [],
					source: "bundled",
					availability: "unknown",
					fetchedAt: Date.now(),
					stale: true,
				}),
				input.refresh,
			);
			if (catalog.failure)
				console.warn("[model-discovery] unavailable", {
					agent: input.agent,
					surface: input.surface,
					reason: catalog.failure,
				});
			return { ...catalog, models: enrichModels(catalog.models, ctx.presetId) };
		});
	} catch (error) {
		console.warn("[model-discovery] unavailable", {
			agent: input.agent,
			surface: input.surface,
			reason: error instanceof DiscoveryError ? error.reason : "failed",
		});
		return {
			...fallback(),
			failure: error instanceof DiscoveryError ? error.reason : "failed",
		};
	}
}
