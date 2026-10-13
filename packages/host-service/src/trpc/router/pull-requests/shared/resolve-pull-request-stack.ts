import { TRPCError } from "@trpc/server";
import { createUserSimpleGit } from "../../../../runtime/git/simple-git";
import { resolveWorktreePath } from "../../git/utils/resolve-worktree";
import {
	findLinkedWorkspaceIds,
	findPullRequestRows,
	type RepoIdentity,
} from "./linked-workspaces";
import {
	assemblePullRequestStack,
	createStackFetchers,
	findMergedLayerBelow,
	type MergedLayerBelow,
	type PullRequestStack,
	type ResolvedStackShape,
	resolveStackShape,
	runStackRootQuery,
	type StackFetchers,
	type StackGraphqlRunner,
} from "./pull-request-stack";

type StackContext = Parameters<typeof resolveWorktreePath>[0];

function linkedWorkspaceId(
	ctx: StackContext,
	repo: RepoIdentity,
	prNumber: number,
): string | null {
	const rows = findPullRequestRows(ctx.db, repo, prNumber);
	return (
		findLinkedWorkspaceIds(
			ctx.db,
			rows.map((row) => row.id),
		)[0] ?? null
	);
}

/**
 * Looks for a merged layer's commits in the worktree of a workspace on this
 * PR. Without one, or without the trunk fetched into it, the answer cannot
 * be known and the stack renders without the merged layer.
 */
async function probeMergedLayerBelow(
	ctx: StackContext,
	workspaceId: string,
	shape: ResolvedStackShape,
	current: { number: number; headRefName: string },
	fetchers: StackFetchers,
): Promise<MergedLayerBelow | null> {
	let worktreePath: string;
	try {
		worktreePath = resolveWorktreePath(ctx, workspaceId);
	} catch (error) {
		if (error instanceof TRPCError) return null;
		throw error;
	}
	const git = createUserSimpleGit(worktreePath);
	const trunkRef = `origin/${shape.baseRefName}`;
	const trunkExists = await git
		.raw(["rev-parse", "--verify", "--quiet", `${trunkRef}^{commit}`])
		.then(() => true)
		.catch(() => false);
	if (!trunkExists) return null;
	const merged = await fetchers.findMergedInto(shape.baseRefName);
	if (merged.length === 0) return null;
	return findMergedLayerBelow({
		current,
		merged,
		trunkRef,
		isAncestor: (oid, ref) =>
			git
				.raw(["merge-base", "--is-ancestor", oid, ref])
				.then(() => true)
				.catch(() => false),
	});
}

/**
 * The stack `prNumber` belongs to, with each layer's linked workspace on
 * this host, or null for a PR that stands alone. Throws when GitHub cannot
 * be read or answers with part of a native stack.
 */
export async function resolvePullRequestStack(
	ctx: StackContext,
	repo: RepoIdentity,
	prNumber: number,
): Promise<PullRequestStack | null> {
	const octokit = await ctx.github();
	const graphql: StackGraphqlRunner = (query, variables) =>
		octokit.graphql(query, variables);
	const repoVariables = { owner: repo.owner, name: repo.name };
	const root = await runStackRootQuery(graphql, {
		...repoVariables,
		number: prNumber,
	});
	if (!root) return null;
	const fetchers = createStackFetchers(graphql, repoVariables);
	const shape = await resolveStackShape(root, prNumber, fetchers);
	if (!shape) return null;

	const current = shape.layers.find((layer) => layer.isCurrent);
	const currentWorkspaceId = linkedWorkspaceId(ctx, repo, prNumber);
	const mergedBelow =
		shape.probeMergedBelow && current?.state === "open" && currentWorkspaceId
			? await probeMergedLayerBelow(
					ctx,
					currentWorkspaceId,
					shape,
					{ number: prNumber, headRefName: current.headRefName },
					fetchers,
				)
			: null;
	const stack = assemblePullRequestStack(shape, mergedBelow);
	if (!stack) return null;
	return {
		...stack,
		layers: stack.layers.map((layer) => ({
			...layer,
			workspaceId: linkedWorkspaceId(ctx, repo, layer.number),
		})),
	};
}
