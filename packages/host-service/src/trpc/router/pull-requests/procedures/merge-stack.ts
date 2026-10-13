import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../../index";
import { actionRejectionError } from "../../github/github";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";
import { evictPullRequestContent } from "../shared/pull-request-content-cache";
import { stackMergeTargets } from "../shared/pull-request-stack";
import { resolvePullRequestStack } from "../shared/resolve-pull-request-stack";
import {
	requestAsyncStackMerge,
	type StackMergeOutcome,
} from "../shared/stack-merge";
import { syncPullRequestAfterWrite } from "../shared/sync-after-write";

const mergeStackInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
	mergeMethod: z.enum(["merge", "squash", "rebase"]).default("merge"),
});

/**
 * Merges a stacked PR together with every open layer below it. The stack is
 * resolved again here rather than trusted from the client, because the
 * layers a merge lands decide whether the ordinary merge is a safe fallback.
 */
export const mergeStack = protectedProcedure
	.input(mergeStackInputSchema)
	.mutation(
		async ({
			ctx,
			input,
		}): Promise<{ outcome: StackMergeOutcome; numbers: number[] }> => {
			const repo = await resolveGithubRepo(ctx, input.projectId);
			const stack = await resolvePullRequestStack(ctx, repo, input.prNumber);
			const targets = stack
				? stackMergeTargets(stack).map((layer) => layer.number)
				: [input.prNumber];
			const lowest = targets[0];
			if (stack?.source === "inferred" && lowest !== input.prNumber) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: `Merge #${lowest} first. A stack built from base branches merges one pull request at a time.`,
				});
			}

			const octokit = await ctx.github();
			let outcome = await requestAsyncStackMerge({
				request: (route, params) => octokit.request(route, params),
				repo,
				prNumber: input.prNumber,
				mergeMethod: input.mergeMethod,
			});
			if (outcome === null) {
				if (targets.length > 1) {
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: `GitHub cannot merge this stack in one step. Merge #${lowest} first.`,
					});
				}
				try {
					await octokit.pulls.merge({
						owner: repo.owner,
						repo: repo.name,
						pull_number: input.prNumber,
						merge_method: input.mergeMethod,
					});
				} catch (error) {
					throw actionRejectionError(error, "GitHub refused the merge.");
				}
				outcome = "merged";
			}

			if (outcome === "merged") {
				for (const prNumber of targets) {
					await syncPullRequestAfterWrite(ctx, {
						repo,
						prNumber,
						action: "merge",
					});
				}
			} else {
				evictPullRequestContent(repo, input.prNumber);
			}
			return { outcome, numbers: targets };
		},
	);
