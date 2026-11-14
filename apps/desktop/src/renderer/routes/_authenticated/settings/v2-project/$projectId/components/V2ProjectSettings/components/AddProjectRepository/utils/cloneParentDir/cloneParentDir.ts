/** A clone lands beside the primary repository. */
export function cloneParentDir(
	primaryPath: string | undefined,
): string | undefined {
	if (!primaryPath) return undefined;
	const trimmed = primaryPath.replace(/(?<=[^/\\])[/\\]+$/, "");
	const match = /^(.*?)([/\\])[^/\\]+$/.exec(trimmed);
	if (!match) return undefined;
	const [, parent = "", separator] = match;
	if (parent === "" || /^[A-Za-z]:$/.test(parent)) return parent + separator;
	return parent;
}
