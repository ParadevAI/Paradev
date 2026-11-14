interface ChangedFileLike {
	path: string;
	oldPath?: string;
}

interface StatusLike {
	againstBase: ChangedFileLike[];
	staged: ChangedFileLike[];
	unstaged: ChangedFileLike[];
	ignoredPaths: string[];
}

/**
 * One status for a tree rooted at the workspace folder. With one checkout the
 * folder is the checkout; with several, each checkout's paths gain its folder name.
 */
export function rootGitStatus<T extends StatusLike>(
	checkouts: Array<{ name: string; data: T | undefined }>,
): T | undefined {
	if (checkouts.length <= 1) return checkouts[0]?.data;
	let merged: T | undefined;
	for (const { name, data } of checkouts) {
		if (!data) continue;
		const prefix = (path: string) => `${name}/${path}`;
		const prefixFiles = <F extends ChangedFileLike>(files: F[]): F[] =>
			files.map((file) => ({
				...file,
				path: prefix(file.path),
				...(file.oldPath ? { oldPath: prefix(file.oldPath) } : {}),
			}));
		const scoped = {
			...data,
			againstBase: prefixFiles(data.againstBase),
			staged: prefixFiles(data.staged),
			unstaged: prefixFiles(data.unstaged),
			ignoredPaths: data.ignoredPaths.map(prefix),
		};
		merged = merged
			? {
					...merged,
					againstBase: [...merged.againstBase, ...scoped.againstBase],
					staged: [...merged.staged, ...scoped.staged],
					unstaged: [...merged.unstaged, ...scoped.unstaged],
					ignoredPaths: [...merged.ignoredPaths, ...scoped.ignoredPaths],
				}
			: scoped;
	}
	return merged;
}
