import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { workspaces } from "../../../../../db/schema";
import { gitCeilingEnv } from "../../../../../runtime/git";
import type { HostServiceContext } from "../../../../../types";
import { listWorkspaceCheckouts } from "../../../../../workspaces/checkouts";
import { resolveCheckoutPath } from "../resolve-worktree";

export interface CheckoutGitStatus {
	/** Null for a project-less session workspace. */
	repositoryId: string | null;
	branch: string | null;
	files: { path: string; index: string; workingDir: string }[];
	isClean: boolean;
}

/** `git status` of every checkout of a workspace, sorted by repository name. */
export async function readWorkspaceGitStatus(
	ctx: Pick<HostServiceContext, "db" | "git">,
	workspaceId: string,
): Promise<{ workspaceId: string; checkouts: CheckoutGitStatus[] }> {
	const workspace = ctx.db
		.select()
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId))
		.get();
	if (!workspace) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
	}
	const repositoryIds: (string | null)[] = listWorkspaceCheckouts(
		ctx.db,
		workspace,
	).map((checkout) => checkout.repository.id);
	if (repositoryIds.length === 0) repositoryIds.push(null);
	return {
		workspaceId,
		checkouts: await Promise.all(
			repositoryIds.map(async (repositoryId) => {
				const { path } = resolveCheckoutPath(ctx, workspaceId, repositoryId);
				const git = await ctx.git(path, { env: gitCeilingEnv(path) });
				const status = await git.status();
				return {
					repositoryId,
					branch: status.current,
					files: status.files.map((f) => ({
						path: f.path,
						index: f.index,
						workingDir: f.working_dir,
					})),
					isClean: status.isClean(),
				};
			}),
		),
	};
}
