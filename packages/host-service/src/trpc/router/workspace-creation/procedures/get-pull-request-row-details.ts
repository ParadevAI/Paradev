import { z } from "zod";
import { isGithubRateLimitError } from "../../../../runtime/pull-requests/utils/github-errors";
import type { HostServiceContext } from "../../../../types";
import { protectedProcedure } from "../../../index";
import {
	collectChunkResults,
	githubRequestError,
} from "../shared/github-search";
import {
	type ResolvedGithubRepo,
	resolveGithubRepo,
} from "../shared/project-helpers";
import {
	fetchPullRequestRowDetails,
	ghFetchPullRequestRowDetails,
	type PullRequestRowDetails,
} from "../shared/pull-request-row-details";

const getPullRequestRowDetailsInputSchema = z.object({
	projects: z
		.array(
			z.object({
				projectId: z.string(),
				prNumbers: z.array(z.number().int().positive()).min(1).max(100),
			}),
		)
		.min(1)
		.max(50),
});

export interface PullRequestRowDetailsRow extends PullRequestRowDetails {
	projectId: string;
	prNumber: number;
}

async function readRowDetails(
	ctx: HostServiceContext,
	repo: ResolvedGithubRepo,
	prNumbers: number[],
): Promise<Map<number, PullRequestRowDetails>> {
	try {
		return await ghFetchPullRequestRowDetails(ctx.execGh, repo, prNumbers);
	} catch (ghErr) {
		// Octokit spends the same user's quota, so a rate limit is final.
		if (isGithubRateLimitError(ghErr)) throw ghErr;
		console.warn(
			"[workspaceCreation.getPullRequestRowDetails] gh path failed; falling back to Octokit",
			ghErr,
		);
		const octokit = await ctx.github();
		return fetchPullRequestRowDetails(
			(query, variables) => octokit.graphql(query, variables),
			repo,
			prNumbers,
		);
	}
}

/**
 * The checks, diff stat and branch of PR list rows that
 * `searchPullRequests({ deferChecks: true })` returned without them.
 */
export const getPullRequestRowDetails = protectedProcedure
	.input(getPullRequestRowDetailsInputSchema)
	.query(
		async ({ ctx, input }): Promise<{ rows: PullRequestRowDetailsRow[] }> => {
			const settled = await Promise.allSettled(
				input.projects.map(async ({ projectId, prNumbers }) => {
					const repo = await resolveGithubRepo(ctx, projectId);
					const details = await readRowDetails(ctx, repo, prNumbers);
					return [...details].map(
						([prNumber, row]): PullRequestRowDetailsRow => ({
							projectId,
							prNumber,
							...row,
						}),
					);
				}),
			);
			let collected: {
				results: PullRequestRowDetailsRow[][];
				failures: unknown[];
			};
			try {
				collected = collectChunkResults(settled);
			} catch (error) {
				throw githubRequestError(error, ctx.credentials);
			}
			if (collected.failures.length > 0) {
				console.warn(
					`[workspaceCreation.getPullRequestRowDetails] ${collected.failures.length} of ${input.projects.length} projects failed; returning the rest`,
					collected.failures,
				);
			}
			return { rows: collected.results.flat() };
		},
	);
