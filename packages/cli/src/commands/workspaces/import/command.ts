import { boolean, CLIError, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../lib/command";
import { requireHostTarget, resolveHostTarget } from "../../../lib/host-target";
import {
	type ImportReport,
	importWorktrees,
	planWorktreeImport,
	type WorktreeRef,
} from "./importWorktrees";

function listLines(worktrees: WorktreeRef[]): string {
	return worktrees
		.map((worktree) => `  ${worktree.branch}  ${worktree.path}`)
		.join("\n");
}

function reportLines(report: ImportReport): string[] {
	return [
		...report.imported.map(
			(item) => `Imported ${item.branch} (${item.path}) as ${item.workspaceId}`,
		),
		...report.skipped.map(
			(item) => `Skipped ${item.branch} (${item.path}): ${item.reason}`,
		),
		...report.failed.map(
			(item) =>
				`Failed ${item.branch ? `${item.branch} (${item.path})` : item.path}: ${item.reason}`,
		),
	];
}

export default command({
	description:
		"Import existing git worktrees of a project on a host as workspaces. Lists untracked worktrees unless --all or --path picks some; worktrees that already have a workspace are skipped, so a re-run changes nothing",
	options: {
		project: string().required().desc("Project ID the worktrees belong to"),
		host: string().desc("Host the worktrees live on (machineId)"),
		local: boolean().desc("The worktrees are on this machine"),
		path: string()
			.variadic()
			.desc(
				"Worktree path to import. Repeatable. Cannot be combined with --all",
			),
		all: boolean().desc("Import every untracked worktree of the project"),
		runSetup: boolean().desc(
			"Run the project's setup script in each imported workspace (off by default; existing worktrees are usually set up)",
		),
		dryRun: boolean().desc(
			"List the worktrees that would be imported without changing anything",
		),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const paths = options.path?.length ? options.path : undefined;
		if (options.all && paths) {
			throw new CLIError(
				"Specify only one of --all or --path",
				"Use --all for every untracked worktree, or --path <dir> for specific ones",
			);
		}
		const hostId = requireHostTarget({
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});
		const target = await resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
		});

		const plan = await planWorktreeImport(target.client, {
			projectId: options.project,
			paths,
			onThisMachine: target.hostId === getHostId(),
		});

		if (options.dryRun || (!options.all && !paths)) {
			const data = {
				dryRun: true,
				wouldImport: plan.candidates,
				skipped: plan.skipped,
				failed: plan.failed,
			};
			const found =
				plan.candidates.length > 0
					? `Would import ${plan.candidates.length} worktree(s) on host ${target.hostId}:\n${listLines(plan.candidates)}`
					: `Nothing to import on host ${target.hostId}`;
			const failures = plan.failed.map(
				(item) => `Failed ${item.path}: ${item.reason}`,
			);
			if (!options.dryRun && plan.candidates.length > 0) {
				throw new CLIError(
					found,
					"Pass --all to import them, or --path <dir> to pick some",
					data,
				);
			}
			if (failures.length > 0) {
				throw new CLIError(
					[found, ...failures].join("\n"),
					"Run with --dry-run --all to list the project's worktrees",
					data,
				);
			}
			return { data, message: found };
		}

		const report = await importWorktrees(target.client, {
			projectId: options.project,
			plan,
			runSetup: options.runSetup ?? false,
		});
		const lines = reportLines(report);
		if (report.failed.length > 0) {
			throw new CLIError(
				lines.join("\n"),
				"Run with --dry-run --all to list the project's worktrees",
				report,
			);
		}
		return {
			data: report,
			message:
				lines.length > 0
					? lines.join("\n")
					: `Nothing to import on host ${target.hostId}`,
		};
	},
});
