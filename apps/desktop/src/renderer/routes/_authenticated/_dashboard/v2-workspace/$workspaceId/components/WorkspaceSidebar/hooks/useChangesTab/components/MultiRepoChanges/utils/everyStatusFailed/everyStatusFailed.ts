/** Whether no checkout has a git status and none is still loading one. */
export function everyStatusFailed(
	statuses: Array<{ data: unknown; isLoading: boolean }>,
): boolean {
	return (
		statuses.length > 0 &&
		statuses.every((status) => !status.data && !status.isLoading)
	);
}
