import {
	type CreatePaneInput,
	createWorkspaceStore,
	type WorkspaceState,
} from "@superset/panes";
import type {
	ChatPaneData,
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
			chatAgentId?: string;
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
	pane: CreatePaneInput<PaneViewerData>;
}

function terminalLaunch(terminalId: string, label?: string): PaneLaunch {
	return {
		sessionId: terminalId,
		label,
		pane: {
			kind: "terminal",
			data: { terminalId } satisfies TerminalPaneData,
		},
	};
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
	const agentLaunches = agents.flatMap((entry): PaneLaunch[] => {
		if (!entry.ok) return [];
		if (!entry.chatSessionId) {
			return [
				terminalLaunch(
					entry.sessionId,
					terminalLabels.has(entry.sessionId)
						? terminalLabels.get(entry.sessionId)
						: entry.label,
				),
			];
		}
		if (!entry.chatAgentId) return [];
		return [
			{
				sessionId: entry.sessionId,
				pane: {
					kind: "chat-v3",
					data: {
						terminalId: entry.sessionId,
						sessionId: entry.chatSessionId,
						agent: { id: entry.chatAgentId },
					} satisfies ChatPaneData,
				},
			},
		];
	});
	const seen = new Set(
		(existing?.tabs ?? []).flatMap((tab) =>
			Object.values(tab.panes).flatMap((pane) => {
				const data = pane.data as Partial<ChatPaneData>;
				return [data.terminalId, data.sessionId].filter(
					(id): id is string => typeof id === "string",
				);
			}),
		),
	);
	const launches = [
		...agentLaunches,
		...terminals.map((entry) => terminalLaunch(entry.terminalId, entry.label)),
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
			...(launch.label ? { titleOverride: launch.label } : {}),
			focus: index === 0,
			panes: [launch.pane],
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
