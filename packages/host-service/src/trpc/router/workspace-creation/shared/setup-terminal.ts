import { eq } from "drizzle-orm";
import { workspaces } from "../../../../db/schema";
import {
	chainPhases,
	invalidConfigCommand,
	loadProjectConfig,
} from "../../../../runtime/setup/config";
import { trackConfigResolved } from "../../../../runtime/setup/track-config-resolved";
import { createTerminalSessionInternal } from "../../../../terminal/terminal";
import type { HostServiceContext } from "../../../../types";
import { resolveWorkspaceScriptContext } from "../../../../workspaces/script-context";
import type { TerminalDescriptor } from "./types";

interface StartSetupTerminalArgs {
	ctx: HostServiceContext;
	workspaceId: string;
	/**
	 * Appended to the resolved setup command with ` && `, so it runs in the
	 * setup terminal only after setup succeeds. Ignored when no setup command
	 * resolves — the caller must then dispatch it separately.
	 */
	chainCommand?: string;
}

interface StartSetupTerminalResult {
	terminal: TerminalDescriptor | null;
	warning: string | null;
	/** True when `chainCommand` was chained into the started setup terminal. */
	chained: boolean;
}

/**
 * Resolve and start the workspace-creation setup terminal, if any.
 *
 * Runs `[install]` then `[setup]` from {@link loadProjectConfig}, joined with
 * ` && ` so failures short-circuit. Scripts that need the canonical
 * config dir read `$SUPERSET_ROOT_PATH`, injected by the v2 terminal
 * env builder. Configured `cwd` is honored via the terminal session.
 *
 * No-op when no source resolves to anything runnable.
 */
export async function startSetupTerminalIfPresent(
	args: StartSetupTerminalArgs,
): Promise<StartSetupTerminalResult> {
	const none = { terminal: null, warning: null, chained: false };
	const workspace = args.ctx.db
		.select()
		.from(workspaces)
		.where(eq(workspaces.id, args.workspaceId))
		.get();
	if (!workspace?.worktreePath) return none;
	const context = resolveWorkspaceScriptContext(args.ctx.db, workspace);
	if (!context) return none;
	const configArgs = {
		repoPath: context.repoPath,
		projectId: context.projectId,
		worktreePath: context.configWorktreePath ?? undefined,
	};

	const resolved = resolveInitialCommand({
		...configArgs,
		scriptRoot: context.scriptRoot,
	});
	trackConfigResolved({
		api: args.ctx.api,
		organizationId: args.ctx.organizationId,
		workspaceId: args.workspaceId,
		phase: "setup",
		...configArgs,
	});
	if (!resolved) return none;

	const initialCommand = args.chainCommand
		? `${resolved.initialCommand} && ${args.chainCommand}`
		: resolved.initialCommand;

	const terminalId = crypto.randomUUID();
	const result = await createTerminalSessionInternal({
		terminalId,
		workspaceId: args.workspaceId,
		db: args.ctx.db,
		eventBus: args.ctx.eventBus,
		initialCommand,
		...(resolved.cwd && { cwd: resolved.cwd }),
	});
	if ("error" in result) {
		return {
			terminal: null,
			warning: `Failed to start setup terminal: ${result.error}`,
			chained: false,
		};
	}

	return {
		terminal: { id: terminalId, role: "setup", label: "Workspace Setup" },
		warning: null,
		chained: Boolean(args.chainCommand),
	};
}

/** Exported for tests. Resolves the initial command for the setup terminal. */
export function resolveInitialCommand(args: {
	repoPath: string;
	projectId: string;
	worktreePath?: string;
	/** Where the scripts run; defaults to the checkout. */
	scriptRoot?: string;
	appHomeDir?: string;
}): { initialCommand: string; cwd?: string } | null {
	const config = loadProjectConfig(args);
	if (!config) return null;
	if (config.kind === "invalid") {
		return { initialCommand: invalidConfigCommand(config) };
	}
	const setup = chainPhases(
		[config.resolved.install, config.resolved.setup],
		args.scriptRoot ?? args.worktreePath ?? args.repoPath,
	);
	if (!setup) return null;
	return {
		initialCommand: setup.command,
		...(setup.cwd && { cwd: setup.cwd }),
	};
}
