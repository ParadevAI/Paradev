/** A clone lands beside the primary repository. */
export function cloneParentDir(
	primaryPath: string | undefined,
): string | undefined {
	if (!primaryPath) return undefined;
	const parent = primaryPath.replace(/[/\\]+[^/\\]+[/\\]*$/, "");
	return parent || undefined;
}
