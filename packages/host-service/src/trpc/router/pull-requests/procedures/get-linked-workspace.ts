import { z } from "zod";
import { listProjectRepositories } from "../../../../projects/repositories";
import type { HostServiceContext } from "../../../../types";
import { protectedProcedure } from "../../../index";
import { resolveGithubRepo } from "../../workspace-creation/shared/project-helpers";
import {
	findLinkedCheckouts,
	findPullRequestRows,
	findPullRequestRowsByRepository,
	type LinkedPullRequestRow,
} from "../shared/linked-workspaces";

const getLinkedWorkspaceInputSchema = z.object({
	projectId: z.string(),
	prNumber: z.number().int().positive(),
	repositoryId: z.string().optional(),
	// A multi-repo project's repositories reuse PR numbers; this names the one meant.
	repoFullName: z.string().optional(),
});

/**
 * The checkout of a live, non-archived workspace that currently points at
 * this PR, if any. Used by the Code tab's "+" comment composer to decide
 * whether to send a prompt into an already-open workspace or spin up a new
 * one. When a repository's remote cannot be resolved (clone gone, remote
 * unreachable) the rows it wrote itself still answer, so an existing link is
 * never mistaken for "none".
 */
export const getLinkedWorkspace = protectedProcedure
	.input(getLinkedWorkspaceInputSchema)
	.query(async ({ ctx, input }) => {
		const repositoryIds = listProjectRepositories(ctx.db, input.projectId)
			.map((repository) => repository.id)
			.filter((id) => !input.repositoryId || id === input.repositoryId);
		const perRepository = await Promise.all(
			repositoryIds.map((repositoryId) =>
				findRepositoryPullRequestRows(ctx, repositoryId, input),
			),
		);
		const rows = perRepository.flat();
		const none = { workspaceId: null, repositoryId: null };
		if (
			!input.repositoryId &&
			!input.repoFullName &&
			isAmbiguous(perRepository)
		) {
			return none;
		}
		const [linked] = findLinkedCheckouts(
			ctx.db,
			rows.map((row) => row.id),
		);
		return linked ?? none;
	});

/** Repositories of one project reuse PR numbers: with no repository named, a number two of them have is no answer. */
function isAmbiguous(perRepository: LinkedPullRequestRow[][]): boolean {
	const distinct = new Set(
		perRepository
			.filter((rows) => rows.length > 0)
			.map((rows) =>
				rows
					.map((row) => row.id)
					.sort()
					.join(","),
			),
	);
	return distinct.size > 1;
}

async function findRepositoryPullRequestRows(
	ctx: HostServiceContext,
	repositoryId: string,
	input: { projectId: string; prNumber: number; repoFullName?: string },
): Promise<LinkedPullRequestRow[]> {
	try {
		const repo = await resolveGithubRepo(ctx, input.projectId, repositoryId);
		if (
			input.repoFullName &&
			`${repo.owner}/${repo.name}`.toLowerCase() !==
				input.repoFullName.toLowerCase()
		) {
			return [];
		}
		return findPullRequestRows(ctx.db, repo, input.prNumber);
	} catch {
		return findPullRequestRowsByRepository(
			ctx.db,
			repositoryId,
			input.prNumber,
			input.repoFullName,
		);
	}
}
