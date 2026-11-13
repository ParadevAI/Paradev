import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { workspaces } from "../../../../db/schema";
import { getLocalProject } from "../../../../projects/local-project-store";
import {
	getPrimaryRepository,
	listProjectRepositories,
} from "../../../../projects/repositories";
import type { HostServiceContext } from "../../../../types";
import {
	type HostWorkspaceRow,
	insertLocalWorkspace,
} from "../../../../workspaces/local-workspace-store";

export type LocalWorkspaceContext = Pick<
	HostServiceContext,
	"db" | "git" | "eventBus"
> &
	Partial<
		Pick<
			HostServiceContext,
			"api" | "organizationId" | "clientMachineId" | "userId"
		>
	>;

export const DEFAULT_LOCAL_WORKSPACE_NAME = "local";

async function getCurrentBranchName(
	git: Awaited<ReturnType<LocalWorkspaceContext["git"]>>,
): Promise<string | null> {
	try {
		const branch = await git.raw(["symbolic-ref", "--short", "HEAD"]);
		const trimmed = branch.trim();
		return trimmed || null;
	} catch {
		try {
			const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
			const trimmed = branch.trim();
			return trimmed && trimmed !== "HEAD" ? trimmed : null;
		} catch {
			return null;
		}
	}
}

/**
 * The branch the project's primary checkout has out right now. Every local
 * workspace of the project shares it, so a detached HEAD means none of them
 * can be described by a branch.
 */
export async function requireCheckedOutBranch(
	ctx: LocalWorkspaceContext,
	repoPath: string,
): Promise<string> {
	const git = await ctx.git(repoPath);
	const branch = await getCurrentBranchName(git);
	if (!branch) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"Repository is in detached-HEAD state. Check out a branch (e.g. `git checkout main`) before creating a local workspace on this device.",
		});
	}
	return branch;
}

export function listLiveLocalWorkspaces(
	ctx: Pick<LocalWorkspaceContext, "db">,
	projectId: string,
): HostWorkspaceRow[] {
	return ctx.db.query.workspaces
		.findMany({
			where: and(
				eq(workspaces.projectId, projectId),
				eq(workspaces.type, "local"),
				isNull(workspaces.archivedAt),
			),
			orderBy: (table, { asc }) => [asc(table.createdAt)],
		})
		.sync();
}

export interface CreateLocalWorkspaceValues {
	projectId: string;
	name: string;
	id?: string;
	taskId?: string | null;
	tags?: string[];
	createdByUserId?: string | null;
}

/**
 * Register a new local workspace on the project's primary checkout. Never
 * clones, adds a worktree, or switches branches: the row is a new identity
 * (terminals, chat, layout) over files the project already has. Nothing
 * creates one implicitly — a project can have zero workspaces.
 */
export async function createLocalWorkspace(
	ctx: LocalWorkspaceContext,
	values: CreateLocalWorkspaceValues,
): Promise<HostWorkspaceRow> {
	const repository = requireSingleRepository(ctx, values.projectId);
	const branch = await requireCheckedOutBranch(ctx, repository.repoPath);
	requireUnchangedProjectCheckout(ctx, values.projectId, repository);
	return insertLocalWorkspace(
		{
			db: ctx.db,
			eventBus: ctx.eventBus,
			api: ctx.api,
			organizationId: ctx.organizationId,
			clientMachineId: ctx.clientMachineId,
			userId: ctx.userId,
		},
		{
			id: values.id,
			projectId: values.projectId,
			worktreePath: repository.repoPath,
			branch,
			name: values.name,
			type: "local",
			taskId: values.taskId ?? null,
			createdByUserId: values.createdByUserId ?? null,
			tags: values.tags,
			checkouts: [{ repositoryId: repository.id, branch }],
		},
	);
}

/** A local workspace is the repository's own checkout, so it needs a project of one repository. */
function requireSingleRepository(
	ctx: Pick<LocalWorkspaceContext, "db">,
	projectId: string,
) {
	const project = getLocalProject(ctx.db, projectId);
	if (!project)
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Project no longer exists.",
		});
	const repositories = listProjectRepositories(ctx.db, projectId);
	const [only] = repositories;
	if (repositories.length !== 1 || !only)
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"local_checkout_single_repo: a project with several repositories can only have worktree workspaces",
		});
	return only;
}

function requireUnchangedProjectCheckout(
	ctx: Pick<LocalWorkspaceContext, "db">,
	projectId: string,
	repository: { id: string; repoPath: string },
): void {
	const project = getLocalProject(ctx.db, projectId);
	if (!project)
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Project no longer exists.",
		});
	const primary = getPrimaryRepository(ctx.db, project);
	if (primary?.id !== repository.id || primary.repoPath !== repository.repoPath)
		throw new TRPCError({
			code: "CONFLICT",
			message:
				"Project checkout moved while creating the workspace. Try again.",
		});
}
