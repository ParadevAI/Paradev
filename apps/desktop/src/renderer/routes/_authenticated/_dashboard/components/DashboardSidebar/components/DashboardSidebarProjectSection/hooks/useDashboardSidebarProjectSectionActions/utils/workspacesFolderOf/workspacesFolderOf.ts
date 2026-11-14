/**
 * The folder a multi-repo workspace root was made in: the root is that folder
 * joined with the branch name, and a branch name can hold slashes. Undefined
 * when the root does not end with the branch, for example an adopted folder.
 */
export function workspacesFolderOf(
	root: string,
	branch: string,
): string | undefined {
	const trimmedRoot = root.replace(/[\\/]+$/, "");
	const segments = branch.split("/").filter(Boolean);
	if (segments.length === 0) return undefined;
	const rootSegments = trimmedRoot.split(/[\\/]/);
	const tail = rootSegments.slice(-segments.length);
	if (tail.join("/") !== segments.join("/")) return undefined;
	let folderLength = trimmedRoot.length;
	for (const segment of segments) folderLength -= segment.length + 1;
	return trimmedRoot.slice(0, folderLength) || undefined;
}
