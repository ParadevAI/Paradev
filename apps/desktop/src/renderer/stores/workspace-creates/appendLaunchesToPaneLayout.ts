import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import type {
	PaneViewerData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";

const EMPTY_STATE: WorkspaceState<PaneViewerData> = {
	version: 1,
	tabs: [],
	activeTabId: null,
};

type AgentLaunchResult =
	| {
			ok: true;
			kind: "terminal";
			sessionId: string;
			label: string;
			chatSessionId?: string;
	  }
	| { ok: false; error: string };

interface AppendArgs {
	existing: WorkspaceState<PaneViewerData> | undefined;
	terminals: Array<{ terminalId: string; label?: string }>;
	agents: AgentLaunchResult[];
}

interface PaneLaunch {
	sessionId: string;
	label?: string;
}

export function appendLaunchesToPaneLayout({
	existing,
	terminals,
	agents,
}: AppendArgs): WorkspaceState<PaneViewerData> {
	const terminalLabels = new Map(
		terminals.map((entry) => [entry.terminalId, entry.label]),
	);
	// A wait-for-setup chained agent reuses the setup terminal, so its result
	// carries the same session id — it gets one tab with the setup label.
	const agentLaunches: PaneLaunch[] = agents
		.filter(
			(entry): entry is Extract<typeof entry, { ok: true }> =>
				entry.ok && !entry.chatSessionId,
		)
		.map((entry) => ({
			sessionId: entry.sessionId,
			label: terminalLabels.has(entry.sessionId)
				? terminalLabels.get(entry.sessionId)
				: entry.label,
		}));
	const seen = new Set<string>();
	const launches = [
		...agentLaunches,
		...terminals.map((entry) => ({
			sessionId: entry.terminalId,
			label: entry.label,
		})),
	].filter((launch) => {
		if (seen.has(launch.sessionId)) return false;
		seen.add(launch.sessionId);
		return true;
	});

	if (launches.length === 0) {
		return existing ?? EMPTY_STATE;
	}

	const store = createWorkspaceStore<PaneViewerData>({
		initialState: existing ?? EMPTY_STATE,
	});

	let firstTabId: string | null = null;
	for (const [index, launch] of launches.entries()) {
		store.getState().addTab({
			titleOverride: launch.label,
			focus: index === 0,
			panes: [
				{
					kind: "terminal",
					data: { terminalId: launch.sessionId } satisfies TerminalPaneData,
				},
			],
		});
		if (index === 0) firstTabId = store.getState().activeTabId;
	}
	if (firstTabId) store.getState().setActiveTab(firstTabId);

	const next = store.getState();
	return {
		version: next.version,
		tabs: next.tabs,
		activeTabId: next.activeTabId,
	};
}
