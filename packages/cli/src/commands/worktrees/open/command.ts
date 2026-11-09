import { boolean, CLIError, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../lib/command";
import { resolveHostFilter, resolveHostTarget } from "../../../lib/host-target";
import { workspaceLinks } from "../../../lib/open-url";
import {
	listProjectWorktrees,
	normalizeWorktreePath,
} from "../projectWorktrees";

export default command({
	description:
		"Open an existing git worktree of a project as a workspace, on a host (default: this machine). Returns the workspace that already tracks it, if any",
	options: {
		project: string().required().desc("Project ID"),
		path: string().desc(
			"Worktree path. Specify exactly one of --path or --branch",
		),
		branch: string().desc("Branch checked out in the worktree"),
		host: string().desc("Host the project is on (machineId)"),
		local: boolean().desc("The project is on this machine (the default)"),
		runSetup: boolean().desc(
			"Run the project's setup script in a newly opened workspace (off by default; an existing worktree is usually set up)",
		),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		if (Boolean(options.path) === Boolean(options.branch)) {
			throw new CLIError(
				"Specify exactly one of --path or --branch",
				"See the project's worktrees: superset worktrees list --project <id>",
			);
		}
		const explicitHost = resolveHostFilter({
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});
		const onThisMachine = !explicitHost || explicitHost === getHostId();
		if (options.path && !onThisMachine && !options.path.startsWith("/")) {
			throw new CLIError(
				"--path must be absolute on another host",
				"Pass the path as `superset worktrees list --host <id>` shows it",
			);
		}
		const target = await resolveHostTarget({
			requestedHostId: explicitHost ?? getHostId(),
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
		});

		const worktrees = await listProjectWorktrees(
			target.client,
			options.project,
		);
		const wanted = options.path
			? normalizeWorktreePath(options.path, onThisMachine)
			: undefined;
		const worktree = worktrees.find((candidate) =>
			wanted
				? normalizeWorktreePath(candidate.path, onThisMachine) === wanted
				: candidate.branch === options.branch,
		);
		if (!worktree) {
			throw new CLIError(
				options.path
					? `No worktree of this project at ${options.path}`
					: `No worktree of this project has ${options.branch} checked out`,
				"See the project's worktrees: superset worktrees list --project <id>",
			);
		}
		if (worktree.isMain) {
			throw new CLIError(
				`${worktree.path} is the project's main checkout, not a linked worktree`,
				"Use: superset workspaces create --project <id> --checkout local",
			);
		}

		const result = await target.client.workspaces.create.mutate({
			projectId: options.project,
			branch: worktree.branch,
			worktreePath: worktree.path,
			runSetup: options.runSetup ?? false,
		});
		const links = workspaceLinks(result.workspace.id);
		const summary = result.alreadyExists
			? `Worktree ${worktree.branch} is already workspace "${result.workspace.name}" on host ${target.hostId}`
			: `Opened worktree ${worktree.branch} as workspace "${result.workspace.name}" on host ${target.hostId}`;
		return {
			data: {
				workspace: result.workspace,
				worktree: { branch: worktree.branch, path: worktree.path },
				alreadyExists: result.alreadyExists,
				...links,
			},
			message: `${summary}\n${links.webUrl}`,
		};
	},
});
