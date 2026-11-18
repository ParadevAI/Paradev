import { expect, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PendingCloudAgentLaunch } from "@superset/shared/cloud-agent-launch";
import { pendingCloudLaunchPane } from "renderer/stores/workspace-creates/pendingCloudLaunch";
import type { PaneViewerData } from "../../../../types";
import { ignoreChatTerminal } from "../../../../utils/closedChatSessions";
import { seedHostPendingLaunch } from "./seedHostPendingLaunch";

function launchOn(terminalId: string): PendingCloudAgentLaunch {
	return {
		agent: "claude",
		surface: "terminal",
		promptHash: "hash",
		terminalId,
		prompt: "fix the login bug",
	};
}

test("the box's launch opens one waiting pane that shows its prompt", () => {
	const store = createWorkspaceStore<PaneViewerData>();
	const launch = launchOn("external-terminal");
	seedHostPendingLaunch(store, launch);
	seedHostPendingLaunch(store, launch);
	expect(store.getState().tabs).toHaveLength(1);
	expect(pendingCloudLaunchPane(store.getState())?.data).toMatchObject({
		terminalId: "external-terminal",
		launchPrompt: "fix the login bug",
	});
});

test("a waiting pane the user closed does not come back when the host answers", () => {
	const store = createWorkspaceStore<PaneViewerData>();
	const launch = launchOn("closed-terminal");
	seedHostPendingLaunch(store, launch);
	const tab = store.getState().tabs[0];
	const pane = pendingCloudLaunchPane(store.getState());
	if (!tab || !pane) throw new Error("expected a waiting pane");
	store
		.getState()
		.closePane({ tabId: tab.id, paneId: pane.id, intent: "remove" });
	ignoreChatTerminal("closed-terminal");
	seedHostPendingLaunch(store, launch);
	expect(store.getState().tabs).toHaveLength(0);
});
