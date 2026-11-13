/**
 * Whether the diff pane's target is in this checkout. With several checkouts
 * a target must name its repository; one checkout takes an untagged target.
 */
export function isDiffTargetForCheckout({
	targetRepositoryId,
	repositoryId,
	isMultiRepo,
}: {
	targetRepositoryId: string | undefined;
	repositoryId: string | undefined;
	isMultiRepo: boolean;
}): boolean {
	if (isMultiRepo) {
		return !!targetRepositoryId && targetRepositoryId === repositoryId;
	}
	return !targetRepositoryId || targetRepositoryId === repositoryId;
}
