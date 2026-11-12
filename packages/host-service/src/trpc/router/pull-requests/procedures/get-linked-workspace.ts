import { z } from "zod";
import { getLocalProject } from "../../../../projects/local-project-store";
import {
	isContainerProject,
	listRepositoryProjects,
} from "../../../../projects/multi-repo";
import type { HostServiceContext } from "../../../../types";
import { getLocalWorkspace } from "../../../../workspaces/local-workspace-store";
import { protectedProcedure } from "../../../index";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";
import {
	findLinkedWorkspaceIds,
	findPullRequestRows,
	findPullRequestRowsByProject,
	type LinkedPullRequestRow,
} from "../shared/linked-workspaces";

const getLinkedWorkspaceInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
	// A multi-repo project's repositories reuse PR numbers; this names the one meant.
	repoFullName: z.string().optional(),
});

/**
 * Whichever live, non-archived workspace currently points at this PR, if
 * any. Used by the Code tab's "+" comment composer to decide whether to
 * send a prompt into an already-open workspace or spin up a new one. When
 * the project's repository cannot be resolved (checkout gone, remote
 * unreachable) the rows the project wrote itself still answer, so an
 * existing link is never mistaken for "none".
 */
export const getLinkedWorkspace = protectedProcedure
	.input(getLinkedWorkspaceInputSchema)
	.query(async ({ ctx, input }) => {
		const projectIds = isContainerProject(
			getLocalProject(ctx.db, input.projectId),
		)
			? listRepositoryProjects(ctx.db, input.projectId).map((repo) => repo.id)
			: [input.projectId];
		const rows = (
			await Promise.all(
				projectIds.map((projectId) =>
					findProjectPullRequestRows(ctx, projectId, input),
				),
			)
		).flat();
		const [linkedId] = findLinkedWorkspaceIds(
			ctx.db,
			rows.map((row) => row.id),
		);
		if (!linkedId) return { workspaceId: null };
		// A multi-repo checkout is hidden; its workspace is the one to open.
		return {
			workspaceId:
				getLocalWorkspace(ctx.db, linkedId)?.parentWorkspaceId ?? linkedId,
		};
	});

async function findProjectPullRequestRows(
	ctx: HostServiceContext,
	projectId: string,
	input: { prNumber: number; repoFullName?: string },
): Promise<LinkedPullRequestRow[]> {
	try {
		const repo = await resolveGithubRepo(ctx, projectId);
		if (
			input.repoFullName &&
			`${repo.owner}/${repo.name}`.toLowerCase() !==
				input.repoFullName.toLowerCase()
		) {
			return [];
		}
		return findPullRequestRows(ctx.db, repo, input.prNumber);
	} catch {
		return findPullRequestRowsByProject(ctx.db, projectId, input.prNumber);
	}
}
