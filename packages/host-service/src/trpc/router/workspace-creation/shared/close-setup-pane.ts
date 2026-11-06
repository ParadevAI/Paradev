import type { PaneLayoutOpResult } from "@superset/shared/pane-layout-ops";

interface PanesApi {
	list(input: { workspaceId: string }): Promise<PaneLayoutOpResult>;
	close(input: { workspaceId: string; paneId: string }): Promise<unknown>;
}

interface CloseSetupPaneArgs {
	panes: PanesApi;
	workspaceId: string;
	terminalId: string;
	attempts: number;
	retryDelayMs: number;
}

/**
 * Closes the pane that shows `terminalId`, which also ends its session. The
 * desktop writes the pane only after the create returns, and a fast setup can
 * finish before that, so a missing pane is retried.
 */
export async function closeSetupPane({
	panes,
	workspaceId,
	terminalId,
	attempts,
	retryDelayMs,
}: CloseSetupPaneArgs): Promise<boolean> {
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			const { layout } = await panes.list({ workspaceId });
			const pane = layout.tabs
				.flatMap((tab) => tab.panes)
				.find((candidate) => candidate.terminalId === terminalId);
			if (pane) {
				await panes.close({ workspaceId, paneId: pane.id });
				return true;
			}
		} catch (error) {
			if (attempt === attempts) {
				console.warn("[setup-terminal] failed to close setup pane", {
					workspaceId,
					terminalId,
					error,
				});
				return false;
			}
		}
		if (attempt < attempts) {
			await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
		}
	}
	return false;
}
