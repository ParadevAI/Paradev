import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { promisify, stripVTControlCharacters } from "node:util";
import { createAcpAdapter } from "@superset/chat-runtime";
import type {
	AgentModelCatalog,
	CatalogModel,
} from "@superset/shared/agent-models";
import {
	getAgentModelSupport,
	resolveAgentLaunchPresetId,
	uniqueModels,
} from "@superset/shared/agent-models";
import { eq } from "drizzle-orm";
import { acpHarnessForPreset } from "../chat-v3/acpCatalogue";
import { acpHarnessFactory } from "../chat-v3/acpHarnesses";
import { agentCliCommand } from "../chat-v3/agentCli";
import type { HostDb } from "../db";
import { workspaces } from "../db/schema";
import { buildHostLaunchEnv } from "../terminal/env";
import {
	agentLaunchEnv,
	resolveHostAgentConfig,
} from "../terminal-agents/agent-config";
import { chatLaunchPresetId } from "../trpc/router/agents/agents";
import { ModelCatalogCache } from "./cache";
import { discoverCodexModels } from "./codex";
import { enrichModels } from "./metadata";

const execFileAsync = promisify(execFile);
const caches = new WeakMap<HostDb, ModelCatalogCache>();
let running = 0;
const waiting: Array<() => void> = [];

async function limited<T>(work: () => Promise<T>): Promise<T> {
	if (running >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
	else running++;
	try {
		return await work();
	} finally {
		const next = waiting.shift();
		if (next) next();
		else running--;
	}
}

function context(
	db: HostDb,
	agent: string,
	surface: "chat" | "terminal",
	workspaceId?: string,
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
	const cwd = workspace?.worktreePath ?? homedir();
	const presetId =
		surface === "chat"
			? chatLaunchPresetId(config)
			: resolveAgentLaunchPresetId(config.presetId, config.command);
	const env = {
		...buildHostLaunchEnv({
			cwd,
			workspaceId: workspaceId ?? "",
			workspacePath: cwd,
			rootPath: cwd,
		}),
		...agentLaunchEnv(db, config),
	};
	const key = createHash("sha256")
		.update(JSON.stringify([config, surface, cwd, env]))
		.digest("hex");
	return { config, cwd, presetId, env, key };
}

export function parseListedModels(
	output: string,
	presetId: string,
): CatalogModel[] {
	const plain = stripVTControlCharacters(output);
	return uniqueModels(
		plain.split(/\r?\n/).flatMap((line) => {
			const match =
				presetId === "opencode"
					? /^([\w.-]+\/\S+)\s*$/.exec(line.trim())
					: /^([\w./:@+-]+)\s+-\s+(.+)$/.exec(line.trim());
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

export function cachedTerminalModels(
	db: HostDb,
	agent: string,
): CatalogModel[] {
	if (!caches.has(db)) return [];
	const { key } = context(db, agent, "terminal");
	const entry = caches.get(db)?.peek(key);
	return entry?.availability === "reported" ? entry.models : [];
}

export async function discoverAgentModels(
	db: HostDb,
	input: {
		agent: string;
		surface: "chat" | "terminal";
		workspaceId?: string;
		refresh?: boolean;
	},
): Promise<AgentModelCatalog> {
	const ctx = context(db, input.agent, input.surface, input.workspaceId);
	enrichModels([], ctx.presetId);
	let cache = caches.get(db);
	if (!cache) {
		cache = new ModelCatalogCache();
		caches.set(db, cache);
	}
	const catalog = await cache.get(
		ctx.key,
		() =>
			limited(async (): Promise<AgentModelCatalog> => {
				let models: CatalogModel[] | undefined;
				const harness = acpHarnessForPreset(ctx.presetId);
				if (input.surface === "chat" && harness) {
					const factory = acpHarnessFactory(
						harness,
						db,
						async () => null,
						undefined,
						true,
					);
					const adapter = factory?.({
						harness,
						cwd: ctx.cwd,
						scopeId: input.workspaceId ?? "",
						sessionId: `model-discovery-${crypto.randomUUID()}`,
						agentConfigId: ctx.config.id,
					});
					if (adapter) {
						try {
							const options = await adapter.discoverModels?.(ctx.cwd);
							models = options?.find(
								(option) => option.category === "model",
							)?.options;
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
						startupTimeoutMs: 10_000,
					});
					try {
						models = (await adapter.discoverModels?.(ctx.cwd))?.find(
							(option) => option.category === "model",
						)?.options;
					} finally {
						await adapter.dispose();
					}
				} else if (ctx.presetId === "codex") {
					models = await discoverCodexModels({
						command: agentCliCommand(ctx.config.command, ctx.env),
						env: ctx.env,
						cwd: ctx.cwd,
					});
				} else if (
					input.surface === "terminal" &&
					ctx.presetId === "cursor-agent"
				) {
					const command = agentCliCommand(ctx.config.command, ctx.env);
					const { stdout } = await execFileAsync(command, ["--list-models"], {
						env: ctx.env,
						cwd: ctx.cwd,
						timeout: 10_000,
						maxBuffer: 4 * 1024 * 1024,
					});
					models = parseListedModels(stdout, ctx.presetId);
					if (!models.length)
						throw new Error("Model listing was not recognized");
				}
				if (models === undefined) throw new Error("Discovery unavailable");
				return {
					models: uniqueModels(models),
					source:
						input.surface === "chat" || ctx.presetId === "opencode"
							? "runtime"
							: "cli",
					availability: "reported",
					fetchedAt: Date.now(),
					stale: false,
				};
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
	return { ...catalog, models: enrichModels(catalog.models, ctx.presetId) };
}
