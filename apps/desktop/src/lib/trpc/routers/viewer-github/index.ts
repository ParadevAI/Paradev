import { Octokit } from "@octokit/core";
import { LocalGitCredentialProvider } from "@superset/host-service/git-credentials";
import {
	githubErrorCode,
	type PullRequestOnGithub,
	pullRequestOnGithub,
} from "@superset/shared/pull-request-github";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const pullRequestInput = z.object({
	repoFullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
	number: z.number().int().positive(),
});
const body = z.string().trim().min(1).max(65536);
const mergeRequest = {
	mergeMethod: z.enum(["merge", "squash", "rebase"]).optional(),
	mergeAction: z.enum(["default", "direct_merge", "merge_queue"]).optional(),
	sha: z.string().min(7).max(64).optional(),
};
const MISSING_LOGIN_TTL_MS = 30_000;

/**
 * Pull requests as the person at this machine, with their own GitHub login
 * (`GH_TOKEN`, a git credential helper, or `gh`). Never a workspace host's:
 * a cloud sandbox or someone else's machine would act as whoever set it up.
 * The token stays in the main process.
 */
export function createViewerGithubRouter(
	credentials: Pick<
		LocalGitCredentialProvider,
		"getToken"
	> = new LocalGitCredentialProvider(),
	clientFor: (token: string) => Octokit = (token) =>
		new Octokit({ auth: token }),
	now: () => number = () => performance.now(),
) {
	// Each miss spawns `git credential fill` and `gh auth token`, and PR panes
	// ask on every poll.
	let missingSince: number | null = null;
	async function isAvailable(): Promise<boolean> {
		if (missingSince !== null && now() - missingSince < MISSING_LOGIN_TTL_MS)
			return false;
		const available = Boolean(await credentials.getToken("github.com"));
		missingSince = available ? null : now();
		return available;
	}

	async function onGithub<T>(
		input: z.infer<typeof pullRequestInput>,
		fallback: string,
		run: (pr: PullRequestOnGithub) => Promise<T>,
	): Promise<T> {
		const token = await credentials.getToken("github.com");
		if (!token) {
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message: "No GitHub login on this machine",
			});
		}
		const octokit = clientFor(token);
		const [owner = "", repo = ""] = input.repoFullName.split("/");
		try {
			return await run(
				pullRequestOnGithub(
					{
						graphql: (query, variables) => octokit.graphql(query, variables),
						request: (route, parameters) => octokit.request(route, parameters),
					},
					{ owner, repo, number: input.number },
				),
			);
		} catch (error) {
			throw new TRPCError({
				code: githubErrorCode(error),
				message:
					error instanceof Error && error.message ? error.message : fallback,
				cause: error,
			});
		}
	}

	return router({
		status: publicProcedure.query(async () => ({
			available: await isAvailable(),
		})),

		getPullRequestDetail: publicProcedure
			.input(pullRequestInput.extend({ activity: z.boolean().optional() }))
			.query(({ input }) =>
				onGithub(input, `Failed to read pull request #${input.number}`, (pr) =>
					pr.detail({ activity: input.activity }),
				),
			),

		getPullRequestThreads: publicProcedure
			.input(pullRequestInput)
			.query(({ input }) =>
				onGithub(input, "Failed to read review threads", (pr) =>
					pr.threads((error) =>
						console.warn(
							`[viewerGithub.getPullRequestThreads] ${input.repoFullName}#${input.number}:`,
							error instanceof Error ? error.message : error,
						),
					),
				),
			),

		getPullRequestDiff: publicProcedure
			.input(pullRequestInput)
			.query(({ input }) =>
				onGithub(input, "Failed to read the diff", (pr) => pr.diff()),
			),

		addPullRequestComment: publicProcedure
			.input(pullRequestInput.extend({ body }))
			.mutation(({ input }) =>
				onGithub(input, "GitHub refused the comment.", (pr) =>
					pr.comment(input.body),
				),
			),

		replyToPullRequestThread: publicProcedure
			.input(
				pullRequestInput.extend({
					commentId: z.number().int().positive(),
					body,
				}),
			)
			.mutation(({ input }) =>
				onGithub(input, "GitHub refused the reply.", (pr) =>
					pr.reply(input.commentId, input.body),
				),
			),

		setPullRequestThreadResolution: publicProcedure
			.input(
				pullRequestInput.extend({
					threadId: z.string().min(1),
					resolved: z.boolean(),
				}),
			)
			.mutation(({ input }) =>
				onGithub(input, "GitHub refused to update the thread.", (pr) =>
					pr.resolveThread(input.threadId, input.resolved),
				),
			),

		mergePullRequest: publicProcedure
			.input(
				pullRequestInput.extend({
					mergeMethod: z.enum(["merge", "squash", "rebase"]),
					commitMessage: z.string().trim().min(1).optional(),
				}),
			)
			.mutation(({ input }) =>
				onGithub(input, "GitHub refused the merge.", (pr) =>
					pr.merge({
						mergeMethod: input.mergeMethod,
						commitMessage: input.commitMessage,
					}),
				),
			),

		setPullRequestState: publicProcedure
			.input(pullRequestInput.extend({ state: z.enum(["open", "closed"]) }))
			.mutation(({ input }) =>
				onGithub(input, "GitHub refused to change the pull request.", (pr) =>
					pr.setState(input.state),
				),
			),

		setPullRequestDraft: publicProcedure
			.input(pullRequestInput.extend({ draft: z.boolean() }))
			.mutation(({ input }) =>
				onGithub(input, "GitHub refused to change the draft state.", (pr) =>
					pr.setDraft(input.draft),
				),
			),

		getPullRequestStack: publicProcedure
			.input(pullRequestInput)
			.query(({ input }) =>
				onGithub(input, "Failed to read the pull request's stack", (pr) =>
					pr.stack(),
				),
			),

		requestPullRequestMerge: publicProcedure
			.input(pullRequestInput.extend(mergeRequest))
			.mutation(({ input }) =>
				onGithub(input, "GitHub refused the merge.", (pr) =>
					pr.requestMerge({
						mergeMethod: input.mergeMethod,
						mergeAction: input.mergeAction,
						sha: input.sha,
					}),
				),
			),

		getPullRequestMergeResult: publicProcedure
			.input(pullRequestInput.extend({ uuid: z.string().min(1).max(200) }))
			.query(({ input }) =>
				onGithub(input, "Failed to read the merge result", (pr) =>
					pr.mergeResult(input.uuid),
				),
			),

		createPullRequestStack: publicProcedure
			.input(
				pullRequestInput.extend({
					pullRequests: z.array(z.number().int().positive()).min(2).max(100),
				}),
			)
			.mutation(({ input }) =>
				onGithub(input, "GitHub refused to create the stack.", (pr) =>
					pr.createStack(input.pullRequests),
				),
			),

		enqueuePullRequest: publicProcedure
			.input(pullRequestInput.extend({ sha: mergeRequest.sha }))
			.mutation(({ input }) =>
				onGithub(
					input,
					"GitHub refused to add the pull request to the merge queue.",
					(pr) => pr.enqueue(input.sha),
				),
			),

		dequeuePullRequest: publicProcedure
			.input(pullRequestInput)
			.mutation(({ input }) =>
				onGithub(
					input,
					"GitHub refused to remove the pull request from the queue.",
					(pr) => pr.dequeue(),
				),
			),
	});
}
