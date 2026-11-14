/** Whether the diff pane's target is in this checkout; an untagged target is. */
export function isDiffTargetForCheckout({
	targetRepositoryId,
	repositoryId,
}: {
	targetRepositoryId: string | undefined;
	repositoryId: string | undefined;
}): boolean {
	return !targetRepositoryId || targetRepositoryId === repositoryId;
}
