import type { HostDb } from "../../../../db";
import {
	getRepository,
	listProjectRepositories,
} from "../../../../projects/repositories";
import type { HostServiceContext } from "../../../../types";

/** A single-repo project lists origin's branches, as before multi-repo projects. */
export function repositoryBranchRemote(
	db: HostDb,
	repositoryId: string,
): string {
	const repository = getRepository(db, repositoryId);
	if (!repository?.remoteName) return "origin";
	return listProjectRepositories(db, repository.projectId).length > 1
		? repository.remoteName
		: "origin";
}

export async function listBranchNames(
	ctx: HostServiceContext,
	repoPath: string,
	remote = "origin",
): Promise<string[]> {
	const git = await ctx.git(repoPath);
	const remotePrefix = `refs/remotes/${remote}/`;
	try {
		const raw = await git.raw([
			"for-each-ref",
			"--sort=-committerdate",
			"--format=%(refname)",
			"refs/heads/",
			remotePrefix,
		]);
		const names = new Set<string>();
		for (const refname of raw.trim().split("\n").filter(Boolean)) {
			// Use the full refname's structural prefix to classify (safe — a
			// branch name can't contain `refs/heads/`). Stripping `origin/`
			// from the SHORT name would misclassify a local branch named
			// `origin/foo`. See GIT_REFS.md.
			let name: string;
			if (refname.startsWith("refs/heads/")) {
				name = refname.slice("refs/heads/".length);
			} else if (refname.startsWith(remotePrefix)) {
				name = refname.slice(remotePrefix.length);
			} else {
				continue;
			}
			if (name && name !== "HEAD") names.add(name);
		}
		return Array.from(names);
	} catch {
		return [];
	}
}
