import { boolean, CLIError, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../lib/command";
import { resolveHostFilter, resolveHostTarget } from "../../../lib/host-target";
import { workspaceLinks } from "../../../lib/open-url";
import {
	listProjectWorktrees,
	normalizeWorktreePath,
	type ProjectWorktree,
} from "../projectWorktrees";

export default command({
	description:
		"Open an existing git worktree of a project as a workspace, on a host (default: this machine). Returns the workspace that already tracks it, if any",
	options: {
		project: string().required().desc("Project ID"),
		path: string().desc(
			"Worktree path. Specify exactly one of --path, --branch or --all",
		),
		branch: string().desc("Branch checked out in the worktree"),
		all: boolean().desc(
			"Open every worktree that is not the main checkout and has no workspace",
		),
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
		const selectors = [options.path, options.branch, options.all].filter(
			Boolean,
		);
		if (selectors.length !== 1) {
			throw new CLIError(
				"Specify exactly one of --path, --branch or --all",
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
		const openWorktree = (worktree: ProjectWorktree) =>
			target.client.workspaces.create.mutate({
				projectId: options.project,
				branch: worktree.branch,
				worktreePath: worktree.path,
				runSetup: options.runSetup ?? false,
			});

		if (options.all) {
			type Opened = {
				workspace: Awaited<ReturnType<typeof openWorktree>>["workspace"];
				worktree: { branch: string; path: string };
			} & ReturnType<typeof workspaceLinks>;
			const opened: Opened[] = [];
			const alreadyExisted: Opened[] = [];
			const failed: {
				worktree: { branch: string; path: string };
				error: string;
			}[] = [];
			for (const worktree of worktrees) {
				if (worktree.isMain || worktree.hasWorkspace) continue;
				const entry = { branch: worktree.branch, path: worktree.path };
				try {
					const result = await openWorktree(worktree);
					const item = {
						workspace: result.workspace,
						worktree: entry,
						...workspaceLinks(result.workspace.id),
					};
					(result.alreadyExists ? alreadyExisted : opened).push(item);
				} catch (error) {
					failed.push({
						worktree: entry,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}
			const data = { opened, alreadyExisted, failed };
			const lines = [
				...opened.map(
					(item) =>
						`Opened ${item.worktree.branch} as workspace "${item.workspace.name}"`,
				),
				...alreadyExisted.map(
					(item) =>
						`${item.worktree.branch} is already workspace "${item.workspace.name}"`,
				),
				...failed.map((item) => `Failed ${item.worktree.path}: ${item.error}`),
			];
			if (failed.length > 0) {
				throw new CLIError(
					`${failed.length} of ${failed.length + opened.length + alreadyExisted.length} worktrees failed to open on host ${target.hostId}`,
					lines.join("\n"),
					data,
				);
			}
			const total = opened.length + alreadyExisted.length;
			return {
				data,
				message:
					total === 0
						? `No worktrees to open on host ${target.hostId}: each one is the main checkout or already a workspace`
						: [
								`Opened ${opened.length} of ${total} worktrees on host ${target.hostId}`,
								...lines,
							].join("\n"),
			};
		}

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

		const result = await openWorktree(worktree);
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
