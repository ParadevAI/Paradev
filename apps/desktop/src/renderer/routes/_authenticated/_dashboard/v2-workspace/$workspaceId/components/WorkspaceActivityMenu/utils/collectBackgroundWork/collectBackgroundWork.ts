export type BackgroundWork = {
	key: string;
	name: string;
	startedAtMs: number;
	terminalId: string;
};

export type DetachedTerminal = {
	terminalId: string;
	title?: string | null;
	createdAt?: number;
};

export function collectBackgroundWork(
	detachedTerminals: readonly DetachedTerminal[],
): BackgroundWork[] {
	return detachedTerminals
		.map((terminal) => ({
			key: `terminal:${terminal.terminalId}`,
			name: terminal.title ?? "",
			startedAtMs: terminal.createdAt ?? 0,
			terminalId: terminal.terminalId,
		}))
		.sort((a, b) => a.startedAtMs - b.startedAtMs);
}
