import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { workspaces } from "../../../../../db/schema";
import { gitCeilingEnv } from "../../../../../runtime/git";
import { isMissingPath } from "../../../../../runtime/path-state";
import type { HostServiceContext } from "../../../../../types";
import { listWorkspaceCheckouts } from "../../../../../workspaces/checkouts";
import { resolveCheckoutPath } from "../resolve-worktree";

export interface CheckoutGitStatus {
	/** Null for a project-less session workspace. */
	repositoryId: string | null;
	branch: string | null;
	files: { path: string; index: string; workingDir: string }[];
	isClean: boolean;
	/** The checkout's folder is gone; the other fields are empty. */
	missing: boolean;
}

/**
 * `git status` of every checkout of a workspace, sorted by repository name.
 * A missing checkout fails the call only when every checkout is missing.
 */
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
	const checkouts: { repositoryId: string | null; missing: boolean }[] =
		listWorkspaceCheckouts(ctx.db, workspace).map((checkout) => ({
			repositoryId: checkout.repository.id,
			missing: isMissingPath(checkout.path),
		}));
	if (checkouts.length === 0) {
		checkouts.push({ repositoryId: null, missing: false });
	}
	const anyOnDisk = checkouts.some((checkout) => !checkout.missing);
	return {
		workspaceId,
		checkouts: await Promise.all(
			checkouts.map(async ({ repositoryId, missing }) => {
				if (missing && anyOnDisk) {
					return {
						repositoryId,
						branch: null,
						files: [],
						isClean: false,
						missing: true,
					};
				}
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
					missing: false,
				};
			}),
		),
	};
}
