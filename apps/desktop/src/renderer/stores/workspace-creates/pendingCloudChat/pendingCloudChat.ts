import {
	createWorkspaceStore,
	type Pane,
	type WorkspaceState,
} from "@superset/panes";
import type { CloudAgentLaunchDescriptor } from "@superset/shared/cloud-agent-launch";
import { HOST_AGENT_PRESETS } from "@superset/shared/host-agent-presets";
import {
	type ChatPaneData,
	type PaneViewerData,
	PENDING_CLOUD_CHAT_PANE_KIND,
	type PendingCloudChatPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { writeWorkspacePaneLayout } from "../writeWorkspacePaneLayout";

export function pendingCloudChatPane(
	layout: WorkspaceState<PaneViewerData> | undefined,
): Pane<PendingCloudChatPaneData> | null {
	for (const tab of layout?.tabs ?? []) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind === PENDING_CLOUD_CHAT_PANE_KIND) {
				return pane as Pane<PendingCloudChatPaneData>;
			}
		}
	}
	return null;
}

export function seedPendingCloudChat({
	collections,
	workspaceId,
	launch,
	prompt,
	chatEnabled,
	modelId,
	modeId,
}: {
	collections: AppCollections;
	workspaceId: string;
	launch: CloudAgentLaunchDescriptor | null | undefined;
	prompt?: string;
	chatEnabled: boolean;
	modelId?: string | null;
	modeId?: string | null;
}): void {
	if (!chatEnabled || launch?.surface !== "chat" || !launch.promptHash) return;
	const existing = collections.v2WorkspaceLocalState.get(workspaceId)
		?.paneLayout as WorkspaceState<PaneViewerData> | undefined;
	if (existing?.tabs.length) return;
	writeWorkspacePaneLayout(
		collections,
		{ id: workspaceId, projectId: null },
		[],
		[],
	);
	const label =
		HOST_AGENT_PRESETS.find((preset) => preset.presetId === launch.agent)
			?.label ?? launch.agent;
	const store = createWorkspaceStore<PaneViewerData>({
		initialState: existing,
	});
	store.getState().addTab({
		panes: [
			{
				kind: PENDING_CLOUD_CHAT_PANE_KIND,
				titleOverride: label,
				data: {
					draftId: crypto.randomUUID(),
					agentId: launch.agent,
					promptHash: launch.promptHash,
					...(prompt ? { launchPrompt: prompt } : {}),
					...(modelId ? { chatModelId: modelId } : {}),
					...(modeId ? { chatModeId: modeId } : {}),
				} satisfies PendingCloudChatPaneData,
			},
		],
	});
	const { version, tabs, activeTabId } = store.getState();
	collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
		draft.paneLayout = { version, tabs, activeTabId };
	});
}

function convertPendingPane(
	state: WorkspaceState<PaneViewerData>,
	paneId: string,
	toData: (data: PendingCloudChatPaneData) => ChatPaneData,
): WorkspaceState<PaneViewerData> {
	return {
		...state,
		tabs: state.tabs.map((tab) => {
			const pane = tab.panes[paneId];
			if (pane?.kind !== PENDING_CLOUD_CHAT_PANE_KIND) return tab;
			const { titleOverride: _waitingTitle, ...rest } = pane;
			return {
				...tab,
				panes: {
					...tab.panes,
					[paneId]: {
						...rest,
						kind: "chat-v3",
						data: toData(pane.data as PendingCloudChatPaneData),
					},
				},
			};
		}),
	};
}

function carriedOver(data: PendingCloudChatPaneData) {
	return {
		draftId: data.draftId,
		...(data.queuedPrompts ? { queuedPrompts: data.queuedPrompts } : {}),
		...(data.chatModelId ? { chatModelId: data.chatModelId } : {}),
		...(data.chatModeId ? { chatModeId: data.chatModeId } : {}),
	};
}

export function attachCloudChatSession(
	state: WorkspaceState<PaneViewerData>,
	paneId: string,
	session: {
		sessionId: string;
		terminalId: string | null;
		harnessSessionId: string | null;
		title: string | null;
	},
): WorkspaceState<PaneViewerData> {
	return convertPendingPane(state, paneId, (data) => ({
		terminalId: session.terminalId ?? session.sessionId,
		sessionId: session.sessionId,
		agent: {
			id: data.agentId,
			...(session.harnessSessionId
				? { sessionId: session.harnessSessionId }
				: {}),
		},
		...carriedOver(data),
		...(data.launchPrompt ? { launchPrompt: data.launchPrompt } : {}),
		...(session.title ? { chatTitle: session.title } : {}),
	}));
}

export function releasePendingCloudChat(
	state: WorkspaceState<PaneViewerData>,
	paneId: string,
): WorkspaceState<PaneViewerData> {
	return convertPendingPane(state, paneId, (data) => ({
		terminalId: crypto.randomUUID(),
		sessionId: null,
		agent: { id: data.agentId },
		...carriedOver(data),
	}));
}
