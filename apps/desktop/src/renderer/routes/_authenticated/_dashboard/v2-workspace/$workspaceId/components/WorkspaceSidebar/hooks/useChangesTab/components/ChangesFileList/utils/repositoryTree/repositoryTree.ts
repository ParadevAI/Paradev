import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";

/** A checkout shown as a top-level folder of one Changes tree. */
export interface RepositoryRoot {
	repositoryId: string;
	name: string;
	/** The checkout's folder; its files' paths are relative to it. */
	path: string;
}

export interface FileCheckout {
	repositoryId: string | undefined;
	worktreePath: string | undefined;
}

function rootOf(
	file: ChangesetFile,
	repositories: RepositoryRoot[] | undefined,
): RepositoryRoot | undefined {
	return repositories?.find(
		(repository) => repository.repositoryId === file.repositoryId,
	);
}

/** The file's path in the tree: under its repository's folder when the tree shows several. */
export function changesTreePath(
	file: ChangesetFile,
	repositories: RepositoryRoot[] | undefined,
): string {
	const root = rootOf(file, repositories);
	return root ? `${root.name}/${file.path}` : file.path;
}

/** The checkout that holds the file, else the list's own checkout. */
export function fileCheckout(
	file: ChangesetFile,
	fallback: FileCheckout,
	repositories: RepositoryRoot[] | undefined,
): FileCheckout {
	const root = rootOf(file, repositories);
	return root
		? { repositoryId: root.repositoryId, worktreePath: root.path }
		: fallback;
}

export interface RepositoryFiles {
	repository: RepositoryRoot;
	files: ChangesetFile[];
	additions: number;
	deletions: number;
}

/** The files of each repository, in repository order; a repository without files is left out. */
export function groupFilesByRepository(
	files: ChangesetFile[],
	repositories: RepositoryRoot[],
): RepositoryFiles[] {
	return repositories.flatMap((repository) => {
		const own = files.filter(
			(file) => file.repositoryId === repository.repositoryId,
		);
		if (own.length === 0) return [];
		return [
			{
				repository,
				files: own,
				additions: own.reduce((sum, file) => sum + (file.additions ?? 0), 0),
				deletions: own.reduce((sum, file) => sum + (file.deletions ?? 0), 0),
			},
		];
	});
}
