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
	runtimeDefaultOption,
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
import { abortable, DISCOVERY_DEADLINE_MS, NoModelListing } from "./discovery";
import { enrichModels, refreshModelMetadata } from "./metadata";

const execFileAsync = promisify(execFile);
const caches = new WeakMap<HostDb, ModelCatalogCache>();

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
								/\s+\((?:current|default)(?:, (?:current|default))*\)$/,
								"",
							),
						},
					]
				: [];
		}),
	);
}

type Discovered = Pick<
	AgentModelCatalog,
	"models" | "defaultModel" | "defaultEffort"
>;
type Context = Awaited<ReturnType<typeof context>>;

function bundledCatalog(presetId: string): AgentModelCatalog {
	return {
		models: getAgentModelSupport(presetId)?.models ?? [],
		availability: "unknown",
	};
}

function fromConfigOptions(options: SessionConfigOption[]): Discovered {
	const model = options.find((entry) => entry.category === "model");
	const effort = options.find((entry) => entry.category === "thought_level");
	if (!model) throw new NoModelListing();
	return {
		models: model.options,
		defaultModel: runtimeDefaultOption(model.options, model.currentValue),
		defaultEffort: effort
			? runtimeDefaultOption(effort.options, effort.currentValue)
			: undefined,
	};
}

async function fromAcp(
	adapter: Pick<
		ReturnType<typeof createAcpAdapter>,
		"discoverModels" | "dispose"
	>,
	cwd: string,
	signal: AbortSignal,
): Promise<Discovered> {
	try {
		return fromConfigOptions(
			await abortable(
				adapter.discoverModels?.(cwd) ?? Promise.resolve([]),
				signal,
			),
		);
	} finally {
		await adapter.dispose();
	}
}

async function discover(
	db: HostDb,
	ctx: Context,
	surface: "chat" | "terminal",
	signal: AbortSignal,
): Promise<Discovered> {
	const command = agentCliCommand(ctx.config.command, ctx.env);
	const harness = acpHarnessForPreset(ctx.presetId);
	if (surface === "chat" && harness && ctx.launch) {
		const adapter = acpHarnessFactory(
			harness,
			db,
			async () => null,
			undefined,
			{
				launch: ctx.launch,
				startupTimeoutMs: DISCOVERY_DEADLINE_MS,
			},
		)?.(ctx.options);
		if (!adapter) throw new NoModelListing();
		return fromAcp(adapter, ctx.cwd, signal);
	}
	if (surface === "terminal" && ctx.presetId === "opencode")
		return fromAcp(
			createAcpAdapter({
				command,
				args: ["acp"],
				env: ctx.env,
				cwd: ctx.cwd,
				startupTimeoutMs: DISCOVERY_DEADLINE_MS,
			}),
			ctx.cwd,
			signal,
		);
	if (ctx.presetId === "codex") {
		const bundled = getAgentModelSupport("codex")?.models ?? [];
		const models = await discoverCodexModels(
			{ command, env: ctx.env, cwd: ctx.cwd },
			signal,
		);
		return {
			models: models.map((model) => ({
				...model,
				label:
					bundled.find((entry) => entry.id === model.id)?.label ?? model.label,
			})),
		};
	}
	if (surface === "terminal" && ctx.presetId === "cursor-agent") {
		const { stdout } = await execFileAsync(command, ["--list-models"], {
			env: ctx.env,
			cwd: ctx.cwd,
			timeout: 10_000,
			maxBuffer: 4 * 1024 * 1024,
			signal,
		});
		const models = parseCursorModels(stdout);
		if (!models.length) throw new Error("Model listing was not recognized");
		return { models };
	}
	throw new NoModelListing();
}

export async function discoverAgentModels(
	db: HostDb,
	input: {
		agent: string;
		surface: "chat" | "terminal";
		workspaceId?: string;
		projectId?: string;
	},
): Promise<AgentModelCatalog> {
	const signal = AbortSignal.timeout(DISCOVERY_DEADLINE_MS);
	let presetId =
		resolveHostAgentConfig(db, input.agent)?.presetId ?? input.agent;
	let cache = caches.get(db);
	if (!cache) {
		cache = new ModelCatalogCache();
		caches.set(db, cache);
	}
	try {
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
		presetId = ctx.presetId;
		refreshModelMetadata();
		const catalog = await cache.get(ctx.key, async () => {
			try {
				const found = await discover(db, ctx, input.surface, signal);
				return {
					...found,
					models: withoutDefaultAlias(uniqueModels(found.models)),
					availability: "reported",
				};
			} catch (error) {
				if (!(error instanceof NoModelListing))
					console.warn("[model-discovery] failed", {
						agent: input.agent,
						surface: input.surface,
						error,
					});
				return bundledCatalog(ctx.presetId);
			}
		});
		return { ...catalog, models: enrichModels(catalog.models, ctx.presetId) };
	} catch (error) {
		console.warn("[model-discovery] failed", {
			agent: input.agent,
			surface: input.surface,
			error,
		});
		return bundledCatalog(presetId);
	}
}
