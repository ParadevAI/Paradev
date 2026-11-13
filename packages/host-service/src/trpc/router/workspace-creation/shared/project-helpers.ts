import { TRPCError } from "@trpc/server";
import { getLocalProject } from "../../../../projects/local-project-store";
import {
	getRepository,
	type HostRepositoryRow,
	listProjectRepositories,
} from "../../../../projects/repositories";
import { createUserSimpleGit } from "../../../../runtime/git/simple-git";
import type { HostServiceContext } from "../../../../types";
import type { ProjectNotSetupCause } from "../../../error-types";
import { getGitHubRemotes } from "../../project/utils/git-remote";
import { readGitToplevel } from "../../project/utils/resolve-repo";
import type { LocalProject } from "./local-project";

export function projectNotSetupError(projectId: string): TRPCError {
	return new TRPCError({
		code: "PRECONDITION_FAILED",
		message: "Project is not set up on this host",
		cause: {
			kind: "PROJECT_NOT_SETUP",
			projectId,
		} satisfies ProjectNotSetupCause,
	});
}

export interface ProjectRepository {
	project: LocalProject;
	repository: HostRepositoryRow;
}

/**
 * The repository of a live project that a call acts on. `repositoryId` may be
 * omitted only when the project has one repository.
 */
export function requireProjectRepository(
	ctx: Pick<HostServiceContext, "db">,
	projectId: string,
	repositoryId?: string | null,
): ProjectRepository {
	const project = getLocalProject(ctx.db, projectId);
	if (!project) throw projectNotSetupError(projectId);
	if (repositoryId) {
		const repository = getRepository(ctx.db, repositoryId);
		if (!repository || repository.projectId !== projectId) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: `repository_not_found: project ${projectId} has no repository ${repositoryId}`,
			});
		}
		return { project, repository };
	}
	const all = listProjectRepositories(ctx.db, projectId);
	const [only] = all;
	if (all.length === 1 && only) return { project, repository: only };
	if (all.length === 0) throw projectNotSetupError(projectId);
	throw new TRPCError({
		code: "BAD_REQUEST",
		message: `repository_required: this project has several repositories (${all
			.map((r) => `${r.name}=${r.id}`)
			.join(", ")}); pass repositoryId`,
	});
}

export interface ResolvedGithubRepo {
	repositoryId: string;
	owner: string;
	name: string;
	/** Canonical local clone path. */
	repoPath: string;
}

/**
 * Resolve `{owner, name, repoPath}` for a repository from the **live** local
 * git remote. The stored owner/name are setup-time snapshots that drift on
 * rename/fork/remote re-point; GitHub queries must target wherever the remote
 * points right now.
 *
 * Remote preference: configured `remoteName` → `origin` → first GitHub remote.
 */
export async function resolveGithubRepo(
	ctx: HostServiceContext,
	projectId: string,
	repositoryId?: string | null,
): Promise<ResolvedGithubRepo> {
	const { repository } = requireProjectRepository(ctx, projectId, repositoryId);
	if (!repository.repoPath) throw projectNotSetupError(projectId);

	let gitRoot: string;
	try {
		gitRoot = await readGitToplevel(repository.repoPath);
	} catch (err) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Failed to inspect git repository at ${repository.repoPath}`,
			cause: err,
		});
	}

	const remotes = await getGitHubRemotes(createUserSimpleGit(gitRoot));
	const preferred =
		(repository.remoteName ? remotes.get(repository.remoteName) : undefined) ??
		remotes.get("origin") ??
		remotes.values().next().value;

	if (!preferred) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Repository at ${gitRoot} has no GitHub remote.`,
		});
	}

	return {
		repositoryId: repository.id,
		owner: preferred.owner,
		name: preferred.name,
		repoPath: gitRoot,
	};
}
