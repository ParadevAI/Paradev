import { getBaseName } from "renderer/lib/pathBasename";

const parentOf = (path: string) => path.replace(/[/\\]+[^/\\]+[/\\]*$/, "");

const repositoryNameOf = (url: string) =>
	url
		.replace(/\.git$/i, "")
		.split(/[/:\\]/)
		.filter(Boolean)
		.pop() ?? "";

function sharedPrefix(names: string[]): string {
	const [first = "", ...rest] = names;
	let prefix = first;
	for (const name of rest) {
		while (!name.startsWith(prefix)) prefix = prefix.slice(0, -1);
	}
	return prefix.replace(/[-_.]+$/, "");
}

/** The folder that holds every local repository, else the name the cloned repositories share. */
export function defaultProjectName(
	repoPaths: string[],
	cloneUrls: string[],
): string {
	const [first] = repoPaths;
	if (first) {
		const parent = parentOf(first);
		const shareParent =
			repoPaths.length > 1 &&
			repoPaths.every((path) => parentOf(path) === parent);
		return getBaseName(shareParent ? parent : first);
	}
	const names = cloneUrls.map(repositoryNameOf);
	return (names.length > 1 && sharedPrefix(names)) || (names[0] ?? "");
}

export { parentOf };
