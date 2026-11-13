import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createGitEnvResolver, gitCeilingEnv } from "../../../../runtime/git";
import { getHostWorkerPool } from "../../../../workers/host-worker-pool";
import { gitPrHeadBaseTask } from "../../../../workers/tasks/git";
import { protectedProcedure } from "../../../index";
import { resolveCheckoutPath } from "../../git/utils/resolve-worktree";
import { actionRejectionError } from "../../github/github";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";

const createInputSchema = z.object({
	workspaceId: z.string(),
	repositoryId: z.string().optional(),
	title: z.string().trim().min(1),
	body: z.string().optional(),
	draft: z.boolean().default(false),
});

/**
 * Creates a GitHub PR from the current branch of one of the workspace's checkouts. The base is the
 * branch's configured `branch.<name>.base` (what the Changes panel's base
 * selector writes) falling back to the repo default branch. After creation
 * the workspace's PR link is refreshed immediately so the UI doesn't wait
 * out the next background sync tick.
 */
export const createForWorkspace = protectedProcedure
	.input(createInputSchema)
	.mutation(async ({ ctx, input }) => {
		const checkout = resolveCheckoutPath(
			ctx,
			input.workspaceId,
			input.repositoryId,
		);
		const projectId = checkout.workspace.projectId;
		if (!projectId || !checkout.repository) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message:
					"Workspace has no linked project, so there is no repository to open a pull request on",
			});
		}
		const worktreePath = checkout.path;
		const gitEnv = {
			...(await createGitEnvResolver(ctx.credentials)(worktreePath)),
			...gitCeilingEnv(worktreePath),
		};
		const refs = await getHostWorkerPool().run(
			gitPrHeadBaseTask,
			{ worktreePath, gitEnv },
			{ timeoutMs: 15_000 },
		);
		const head = refs.head;
		if (!head) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Cannot create a pull request from a detached HEAD",
			});
		}

		const base = (refs.configuredBase || refs.defaultBranch || "")
			.replace(/^origin\//, "")
			.trim();
		if (!base) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Could not determine a base branch for the pull request",
			});
		}
		if (base === head) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Branch ${head} is the base branch — nothing to open a pull request from`,
			});
		}

		const repo = await resolveGithubRepo(
			ctx,
			projectId,
			checkout.repository.id,
		);
		const octokit = await ctx.github();
		let created: { number: number; html_url: string };
		try {
			const { data } = await octokit.pulls.create({
				owner: repo.owner,
				repo: repo.name,
				title: input.title,
				head,
				base,
				draft: input.draft,
				...(input.body ? { body: input.body } : {}),
			});
			created = data;
		} catch (error) {
			throw actionRejectionError(
				error,
				"GitHub refused to create the pull request.",
			);
		}
		// The PR exists at this point — a refresh hiccup (rate limit, transient
		// network) must not surface as a create failure; the background sync
		// links it within its next pass anyway.
		try {
			await ctx.runtime.pullRequests.refreshPullRequestsByWorkspaces([
				input.workspaceId,
			]);
		} catch (error) {
			console.warn(
				"[pull-requests:create-for-workspace] created PR but failed to refresh workspace link",
				{ workspaceId: input.workspaceId, prNumber: created.number, error },
			);
		}
		return { number: created.number, url: created.html_url };
	});
