import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { queryProcedure } from "../../../index";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";
import type { PullRequestStack } from "../shared/pull-request-stack";
import { resolvePullRequestStack } from "../shared/resolve-pull-request-stack";

const getStackInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
});

/**
 * The stack this PR belongs to: GitHub's own when the PR is in one,
 * otherwise the base-branch chain through the repository's open PRs. Null
 * for a PR that stands alone, and for a project with no GitHub remote. A
 * GitHub failure is an error, not null: the client must not offer a plain
 * merge for what may be one layer of a stack.
 */
export const getStack = queryProcedure
	.meta({ timeoutMs: 30_000 })
	.input(getStackInputSchema)
	.query(async ({ ctx, input }): Promise<PullRequestStack | null> => {
		let repo: Awaited<ReturnType<typeof resolveGithubRepo>>;
		try {
			repo = await resolveGithubRepo(ctx, input.projectId);
		} catch (error) {
			if (error instanceof TRPCError) return null;
			throw error;
		}
		return resolvePullRequestStack(ctx, repo, input.prNumber);
	});
