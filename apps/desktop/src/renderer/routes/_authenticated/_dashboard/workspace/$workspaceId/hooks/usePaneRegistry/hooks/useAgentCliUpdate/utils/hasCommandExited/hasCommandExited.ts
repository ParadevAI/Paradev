/**
 * Whether the update command in its terminal has finished. The shell's own
 * start-up runs processes too, and the command is typed only once the shell is
 * ready, so nothing counts until the terminal has been open longer than that
 * takes.
 */
export function hasCommandExited(options: {
	running: boolean;
	openedAt: number | undefined;
	now: number;
	startGraceMs: number;
}): boolean {
	return (
		!options.running &&
		options.openedAt !== undefined &&
		options.now - options.openedAt >= options.startGraceMs
	);
}
