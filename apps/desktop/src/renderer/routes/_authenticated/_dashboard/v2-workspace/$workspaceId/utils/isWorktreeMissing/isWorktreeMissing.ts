export function isWorktreeMissing(
	query: {
		isFetching: boolean;
		isFetchedAfterMount: boolean;
		data?: { worktreeExists: boolean };
	},
	isWaitingForCloudChat: boolean,
): boolean {
	return (
		!isWaitingForCloudChat &&
		query.isFetchedAfterMount &&
		query.data?.worktreeExists === false
	);
}
