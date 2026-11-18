/**
 * Whether the update command in its terminal has finished. A command can start
 * and exit between two polls, so one never seen running counts as finished once
 * the terminal has been open longer than a shell takes to start it.
 */
export function hasCommandExited(options: {
	running: boolean;
	ran: boolean;
	openedAt: number | undefined;
	now: number;
	startGraceMs: number;
}): boolean {
	if (options.running) return false;
	if (options.ran) return true;
	return (
		options.openedAt !== undefined &&
		options.now - options.openedAt >= options.startGraceMs
	);
}
