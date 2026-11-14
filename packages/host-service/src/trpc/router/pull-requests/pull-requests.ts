import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { workspaces } from "../../../db/schema";
import type { HostServiceContext } from "../../../types";
import {
	listWorkspaceCheckouts,
	resolveCheckout,
} from "../../../workspaces/checkouts";
import { protectedProcedure, router } from "../../index";
import { findRepositoryByGithubName } from "../workspace-creation/shared/project-helpers";
import { addComment } from "./procedures/add-comment";
import { createForWorkspace } from "./procedures/create-for-workspace";
import { getContent } from "./procedures/get-content";
import { getContentByRepo } from "./procedures/get-content-by-repo";
import { getDiff } from "./procedures/get-diff";
import { getDiffByRepo } from "./procedures/get-diff-by-repo";
import { getLinkedWorkspace } from "./procedures/get-linked-workspace";
import { getThreads } from "./procedures/get-threads";
import { mergePR } from "./procedures/merge";
import { replyToThread } from "./procedures/reply-to-thread";
import { setDraft } from "./procedures/set-draft";
import { setState } from "./procedures/set-state";
import { setThreadResolution } from "./procedures/set-thread-resolution";

export const pullRequestsRouter = router({
	getByWorkspaces: protectedProcedure
		.input(
			z.object({
				workspaceIds: z.array(z.string()),
			}),
		)
		.query(async ({ ctx, input }) => {
			const workspaces =
				await ctx.runtime.pullRequests.getPullRequestsByWorkspaces(
					input.workspaceIds,
				);
			// Why links may be stale: the sweep keeps existing links through a
			// rate limit, outage, or rejected credential but cannot create new
			// ones, and a workspace with no PR chip says nothing on its own.
			return {
				workspaces,
				github: ctx.runtime.pullRequests.getGithubStatus(),
			};
		}),
	/**
	 * Every PR each workspace has ever been linked to, per checkout, current one first.
	 * `getByWorkspaces` stays the sidebar's view (the one currently-linked PR,
	 * honoring Remove PR Link); this is the full record behind it.
	 */
	historyByWorkspaces: protectedProcedure
		.input(
			z.object({
				workspaceIds: z.array(z.string()),
			}),
		)
		.query(async ({ ctx, input }) => {
			const workspaces =
				await ctx.runtime.pullRequests.getPullRequestHistoryByWorkspaces(
					input.workspaceIds,
				);
			return { workspaces };
		}),
	unlinkFromWorkspace: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				repositoryId: z.string().optional(),
				/** GitHub "owner/name", for a caller that has the PR but not its repository id. */
				repository: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { repository } = resolveCheckout(
				ctx.db,
				input.workspaceId,
				input.repositoryId ??
					(input.repository
						? await findCheckoutRepositoryByGithubName(
								ctx,
								input.workspaceId,
								input.repository,
							)
						: undefined),
			);
			if (repository) {
				ctx.runtime.pullRequests.unlinkWorkspacePullRequest(
					input.workspaceId,
					repository.id,
				);
			}
			return { ok: true };
		}),
	refreshByWorkspaces: protectedProcedure
		.input(
			z.object({
				workspaceIds: z.array(z.string()),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await ctx.runtime.pullRequests.refreshPullRequestsByWorkspaces(
				input.workspaceIds,
			);
			return { ok: true };
		}),
	/** @deprecated Use the API's `integration.github.addPullRequestComment`, which acts as the viewer. Kept for released clients. */
	addComment,
	createForWorkspace,
	/** @deprecated Use the API's `integration.github.getPullRequestDetail` with `activity: true`, which acts as the viewer. Kept for released clients. */
	getContent,
	/** @deprecated Use the API's `integration.github.getPullRequestDetail` with `activity: true`, which acts as the viewer. Kept for released clients. */
	getContentByRepo,
	/** @deprecated Use the API's `integration.github.getPullRequestDiff`, which acts as the viewer. Kept for released clients. */
	getDiff,
	/** @deprecated Use the API's `integration.github.getPullRequestDiff`, which acts as the viewer. Kept for released clients. */
	getDiffByRepo,
	getLinkedWorkspace,
	/** @deprecated Use the API's `integration.github.getPullRequestThreads`, which acts as the viewer. Kept for released clients. */
	getThreads,
	/** @deprecated Use the API's `integration.github.setPullRequestDraft`, which acts as the viewer. Kept for released clients. */
	setDraft,
	/** @deprecated Use the API's `integration.github.setPullRequestState`, which acts as the viewer. Kept for released clients. */
	setState,
	/** @deprecated Use the API's `integration.github.setPullRequestThreadResolution`, which acts as the viewer. Kept for released clients. */
	setThreadResolution,
	/** @deprecated Use the API's `integration.github.replyToPullRequestThread`, which acts as the viewer. Kept for released clients. */
	replyToThread,
	/** @deprecated Use the API's `integration.github.mergePullRequest`, which acts as the viewer. Kept for released clients. */
	mergePR,
});

/** Only a workspace of several checkouts needs the name; with one, it is that checkout. */
async function findCheckoutRepositoryByGithubName(
	ctx: HostServiceContext,
	workspaceId: string,
	fullName: string,
): Promise<string | undefined> {
	const workspace = ctx.db
		.select({ id: workspaces.id, worktreePath: workspaces.worktreePath })
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId))
		.get();
	if (!workspace) return undefined;
	const checkouts = listWorkspaceCheckouts(ctx.db, workspace);
	if (checkouts.length < 2) return undefined;
	const repositoryId = await findRepositoryByGithubName(
		ctx,
		checkouts.map((checkout) => checkout.repository),
		fullName,
	);
	if (!repositoryId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `repository_not_in_project: ${fullName} is not a repository of this workspace`,
		});
	}
	return repositoryId;
}
