export function launchEffort(
	selectedEffort: string | null,
	launch: { openAsChat: boolean; hostLaunchesChatWithEffort: boolean },
): string | undefined {
	if (launch.openAsChat && !launch.hostLaunchesChatWithEffort) return undefined;
	return selectedEffort ?? undefined;
}
