import { describe, expect, it } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "../../../../types";
import { reopenChatSession } from "../../../../utils/closedChatSessions";
import { chatPanesClosedElsewhere } from "./chatPanesClosedElsewhere";

function storeWithChats(...sessionIds: string[]) {
	const store = createWorkspaceStore<PaneViewerData>();
	for (const sessionId of sessionIds) {
		store.getState().addTab({
			panes: [
				{
					kind: "chat-v3",
					data: {
						terminalId: `terminal-${sessionId}`,
						sessionId,
						agent: { id: "claude" },
					},
				},
			],
		});
	}
	return store;
}

const listed = (sessionId: string, overrides = {}) => ({
	sessionId,
	live: false,
	closedByUser: true,
	...overrides,
});

describe("chatPanesClosedElsewhere", () => {
	it("finds chat panes whose chat a person closed and that stopped", () => {
		const store = storeWithChats("closed-on-device-a", "kept-on-device-a");
		const [closedTab] = store.getState().tabs;
		const found = chatPanesClosedElsewhere(
			[
				listed("closed-on-device-a"),
				listed("kept-on-device-a", { closedByUser: false }),
			],
			store.getState().tabs,
		);
		expect(found).toEqual([
			{
				tabId: closedTab?.id ?? "",
				paneId: Object.keys(closedTab?.panes ?? {})[0] ?? "",
			},
		]);
	});

	it("keeps chats that restarted internally, are still live, or come from an older host", () => {
		const store = storeWithChats("restarting", "live", "old-host");
		expect(
			chatPanesClosedElsewhere(
				[
					listed("restarting", { closedByUser: false }),
					listed("live", { live: true }),
					{ sessionId: "old-host", live: false },
				],
				store.getState().tabs,
			),
		).toEqual([]);
	});

	it("keeps a chat opened again in this window after it was closed", () => {
		const store = storeWithChats("reopened-from-history");
		reopenChatSession("reopened-from-history");
		expect(
			chatPanesClosedElsewhere(
				[listed("reopened-from-history")],
				store.getState().tabs,
			),
		).toEqual([]);
	});
});
