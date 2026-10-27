import { afterEach, expect, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import { act, cleanup, renderHook } from "@testing-library/react";
import { attachCloudChatSession } from "renderer/stores/workspace-creates/pendingCloudChat";
import { type PaneViewerData, PENDING_CLOUD_CHAT_PANE_KIND } from "../../types";
import { useIsChatTabActive } from "./useIsChatTabActive";

afterEach(cleanup);

test("the waiting chat keeps the chat layout before and after attaching", () => {
	const store = createWorkspaceStore<PaneViewerData>();
	store.getState().addTab({
		panes: [
			{
				kind: PENDING_CLOUD_CHAT_PANE_KIND,
				data: { draftId: "draft", agentId: "claude", promptHash: "hash" },
			},
		],
	});
	const paneId = Object.keys(store.getState().tabs[0]?.panes ?? {})[0];
	if (!paneId) throw new Error("missing pane");
	const hook = renderHook(() => useIsChatTabActive(store));
	expect(hook.result.current).toBe(true);
	act(() =>
		store.getState().replaceState((state) =>
			attachCloudChatSession(state, paneId, {
				sessionId: "chat",
				terminalId: "terminal",
				harnessSessionId: null,
				title: null,
			}),
		),
	);
	expect(hook.result.current).toBe(true);
});
