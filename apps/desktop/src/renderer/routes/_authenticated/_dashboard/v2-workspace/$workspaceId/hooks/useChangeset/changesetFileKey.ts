import type { ChangesetFile } from "./types";

export function getChangesetFileKey(file: ChangesetFile): string {
	const key = getSourceKey(file);
	return file.workspaceId ? `${file.workspaceId}|${key}` : key;
}

/** The checkout a file is in: its tag, else the view's own workspace. */
export function getChangesetFileWorkspaceId(
	file: ChangesetFile,
	fallback: string,
): string {
	return file.workspaceId ?? fallback;
}

function getSourceKey(file: ChangesetFile): string {
	const { source } = file;
	if (source.kind === "against-base") {
		return `against-base:${source.baseBranch ?? ""}:${file.path}`;
	}
	if (source.kind === "commit") {
		return `commit:${source.fromHash ?? ""}:${source.commitHash}:${file.path}`;
	}
	return `${source.kind}:${file.path}`;
}
