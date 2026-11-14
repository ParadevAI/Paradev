import { delimiter } from "node:path";
import { getBinDir } from "@superset/agent-setup";
import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { workspaces } from "../db/schema";
import { getProjectIncludingDeleted } from "../projects/local-project-store";
import { waitForSandboxManagedEnv } from "../runtime/sandbox-managed-env";
import { buildHostLaunchEnv, waitForTerminalBaseEnv } from "../terminal/env";
import {
	agentLaunchEnv,
	resolveHostAgentConfig,
} from "../terminal-agents/agent-config";
import { chatLaunchPresetId } from "../trpc/router/agents/agents";
import { resolveDefaultAccountTerminalEnv } from "../trpc/router/usage/default-account";

function workspacePaths(
	db: HostDb,
	workspaceId: string,
): { workspacePath: string; rootPath: string } {
	const workspace = db.query.workspaces
		.findFirst({ where: eq(workspaces.id, workspaceId) })
		.sync();
	const project = workspace?.projectId
		? getProjectIncludingDeleted(db, workspace.projectId)
		: undefined;
	return {
		workspacePath: workspace?.worktreePath ?? "",
		rootPath: project?.repoPath ?? "",
	};
}

function withSupersetBinFirst(
	env: Record<string, string>,
): Record<string, string> {
	const binDir = getBinDir();
	const key =
		Object.keys(env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
	const entries = (env[key] ?? "")
		.split(delimiter)
		.filter((entry) => entry && entry !== binDir);
	return { ...env, [key]: [binDir, ...entries].join(delimiter) };
}

function withoutAmbientKeys(
	env: Record<string, string>,
): Record<string, string> {
	// In a sandbox these are the creator's sign-in, filled in by the firewall.
	if (process.env.SUPERSET_HOST_RUN_MODE === "sandbox") return env;
	const { ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, ...rest } = env;
	return rest;
}

/**
 * The launch env an agent config adds, account dir and keys included. A config
 * edited to run another CLI since the chat started adds nothing: its env
 * belongs to that CLI.
 */
function configEnv(
	db: HostDb,
	agentConfigId: string | undefined,
	presetId: string | undefined,
): Record<string, string> {
	const config = agentConfigId
		? resolveHostAgentConfig(db, agentConfigId)
		: null;
	if (!config || !presetId || chatLaunchPresetId(config) !== presetId)
		return {};
	return agentLaunchEnv(db, config);
}

/** A key the config brings replaces both base keys, so a sandbox token cannot win over it. */
function withoutReplacedKeys(
	env: Record<string, string>,
	overlay: Record<string, string>,
): Record<string, string> {
	if (!overlay.ANTHROPIC_API_KEY && !overlay.ANTHROPIC_AUTH_TOKEN) return env;
	const { ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, ...rest } = env;
	return rest;
}

/**
 * A chat agent is launched with the env a terminal would launch it with, so
 * the same CLI resolves the same tools and auth either way. `~/.paradev/bin`
 * leads PATH because a terminal picks that up from the shell bootstrap, which
 * a directly spawned agent never runs, and it is what puts the superset CLI
 * and the agent wrappers in reach. A chat opened with an agent config gets
 * that config's env on top, as its terminal would, so a "Claude (work)" chat
 * runs on the work account; a key set there is the user's own and stays.
 */
export async function buildChatAgentEnv(options: {
	db: HostDb;
	cwd: string;
	workspaceId: string;
	terminalId?: string;
	agentConfigId?: string;
	/** The CLI the chat runs (`claude`, `codex`, …); a config applies only to its own. */
	presetId?: string;
}): Promise<Record<string, string>> {
	await Promise.all([waitForTerminalBaseEnv(), waitForSandboxManagedEnv()]);
	const paths = workspacePaths(options.db, options.workspaceId);
	const overlay = configEnv(
		options.db,
		options.agentConfigId,
		options.presetId,
	);
	return withSupersetBinFirst({
		...withoutReplacedKeys(
			withoutAmbientKeys({
				...buildHostLaunchEnv({
					cwd: options.cwd,
					workspaceId: options.workspaceId,
					terminalId: options.terminalId,
					workspacePath: paths.workspacePath || options.cwd,
					rootPath: paths.rootPath,
				}),
				...resolveDefaultAccountTerminalEnv(options.db),
			}),
			overlay,
		),
		...overlay,
	});
}
