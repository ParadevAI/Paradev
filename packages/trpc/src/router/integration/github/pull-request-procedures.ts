import type { PullRequestDetailRead } from "@superset/shared/pull-request-detail";
import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { personProcedure } from "../../../trpc";
import { githubRequestError } from "./github-request-error";
import { asViewer } from "./viewer-octokit";

const pullRequestInput = z.object({
	organizationId: z.string().uuid(),
	repoFullName: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
	number: z.number().int().positive(),
});
// GitHub rejects bodies past 65536 characters.
const body = z.string().trim().min(1).max(65536);
const mergeRequest = {
	mergeMethod: z.enum(["merge", "squash", "rebase"]).optional(),
	mergeAction: z.enum(["default", "direct_merge", "merge_queue"]).optional(),
	sha: z.string().min(7).max(64).optional(),
};

async function onGithub<T>(
	fallback: string,
	run: () => Promise<T>,
): Promise<T> {
	try {
		return await run();
	} catch (error) {
		throw githubRequestError(error, fallback);
	}
}

/**
 * A pull request by its own identity, read and written as the person asking.
 * The work is `@superset/shared/pull-request-github`, which the desktop also
 * runs with the `gh` login on the person's own machine.
 */
export const pullRequestProcedures = {
	/** Mergeability, checks, reviewers and the viewer's own capabilities; with `activity`, the conversation and commits too. */
	getPullRequestDetail: personProcedure
		.input(pullRequestInput.extend({ activity: z.boolean().optional() }))
		.query(async ({ ctx, input }): Promise<PullRequestDetailRead> => {
			const pr = await asViewer(ctx.session.user.id, input);
			return onGithub(`Failed to read pull request #${pr.number}`, () =>
				pr.detail({ activity: input.activity }),
			);
		}),

	getPullRequestThreads: personProcedure
		.input(pullRequestInput)
		.query(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input);
			return pr.threads((error) => {
				console.warn(
					`[github.getPullRequestThreads] ${input.repoFullName}#${input.number}:`,
					error instanceof Error ? error.message : error,
				);
			});
		}),

	/** Additions and deletions alone, for a row in a list. */
	getPullRequestDiffstat: personProcedure
		.input(pullRequestInput)
		.query(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input);
			return onGithub(`Failed to read pull request #${pr.number}`, () =>
				pr.diffstat(),
			);
		}),

	addPullRequestComment: personProcedure
		.input(pullRequestInput.extend({ body }))
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input);
			return onGithub("GitHub refused the comment.", () =>
				pr.comment(input.body),
			);
		}),

	replyToPullRequestThread: personProcedure
		.input(
			pullRequestInput.extend({ commentId: z.number().int().positive(), body }),
		)
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input);
			return onGithub("GitHub refused the reply.", () =>
				pr.reply(input.commentId, input.body),
			);
		}),

	setPullRequestThreadResolution: personProcedure
		.input(
			pullRequestInput.extend({
				threadId: z.string().min(1),
				resolved: z.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input);
			return onGithub("GitHub refused to update the thread.", () =>
				pr.resolveThread(input.threadId, input.resolved),
			);
		}),

	mergePullRequest: personProcedure
		.input(
			pullRequestInput.extend({
				mergeMethod: z.enum(["merge", "squash", "rebase"]).default("merge"),
				commitMessage: z.string().trim().min(1).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input);
			return onGithub("GitHub refused the merge.", () =>
				pr.merge({
					mergeMethod: input.mergeMethod,
					commitMessage: input.commitMessage,
				}),
			);
		}),

	setPullRequestState: personProcedure
		.input(pullRequestInput.extend({ state: z.enum(["open", "closed"]) }))
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input);
			await onGithub(
				`GitHub refused to ${input.state === "closed" ? "close" : "reopen"} the pull request.`,
				() => pr.setState(input.state),
			);
			return { ok: true as const };
		}),

	setPullRequestDraft: personProcedure
		.input(pullRequestInput.extend({ draft: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input);
			await onGithub(
				input.draft
					? "GitHub refused to convert the pull request to a draft."
					: "GitHub refused to mark the pull request ready for review.",
				() => pr.setDraft(input.draft),
			);
			return { ok: true as const };
		}),

	updatePullRequestBranch: personProcedure
		.input(pullRequestInput)
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input);
			await onGithub("GitHub refused to update the branch.", () =>
				pr.updateBranch(),
			);
			return { ok: true as const };
		}),

	/** The pull request's stack: GitHub's own, or the chain of base branches it sits in. Null when it stands alone. */
	getPullRequestStack: personProcedure
		.input(pullRequestInput)
		.query(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input);
			return onGithub(
				`Failed to read the stack of pull request #${pr.number}`,
				() => pr.stack(),
			);
		}),

	/**
	 * Starts a background merge, which is the only merge that lands a stack
	 * or joins a merge queue. The caller polls `getPullRequestMergeResult`
	 * while the answer is `pending`.
	 */
	requestPullRequestMerge: personProcedure
		.input(pullRequestInput.extend(mergeRequest))
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input);
			return onGithub("GitHub refused the merge.", () =>
				pr.requestMerge({
					mergeMethod: input.mergeMethod,
					mergeAction: input.mergeAction,
					sha: input.sha,
				}),
			);
		}),

	getPullRequestMergeResult: personProcedure
		.input(pullRequestInput.extend({ uuid: z.string().min(1).max(200) }))
		.query(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input);
			return onGithub("Failed to read the merge result", () =>
				pr.mergeResult(input.uuid),
			);
		}),

	/** Turns a chain of pull requests into a stack on GitHub; `pullRequests` runs bottom to top. */
	createPullRequestStack: personProcedure
		.input(
			pullRequestInput.extend({
				pullRequests: z.array(z.number().int().positive()).min(2).max(100),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input);
			return onGithub("GitHub refused to create the stack.", () =>
				pr.createStack(input.pullRequests),
			);
		}),

	enqueuePullRequest: personProcedure
		.input(pullRequestInput.extend({ sha: mergeRequest.sha }))
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input);
			await onGithub(
				"GitHub refused to add the pull request to the merge queue.",
				() => pr.enqueue(input.sha),
			);
			return { ok: true as const };
		}),

	dequeuePullRequest: personProcedure
		.input(pullRequestInput)
		.mutation(async ({ ctx, input }) => {
			const pr = await asViewer(ctx.session.user.id, input);
			await onGithub(
				"GitHub refused to remove the pull request from the queue.",
				() => pr.dequeue(),
			);
			return { ok: true as const };
		}),
} satisfies TRPCRouterRecord;
