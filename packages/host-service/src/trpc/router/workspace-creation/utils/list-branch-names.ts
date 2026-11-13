import type { HostServiceContext } from "../../../../types";

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
