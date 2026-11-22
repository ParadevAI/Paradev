import { describe, expect, it } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "../../../../types";
import { storedPanesTheHostClosed } from "./storedPanesTheHostClosed";

function storeWithChats(...sessionIds: string[]) {
	const store = createWorkspaceStore<PaneViewerData>();
	for (const sessionId of sessionIds) {
		store.getState().addTab({
			panes: [
				{
					kind: "chat-v3",
					data: { terminalId: sessionId, sessionId, agent: { id: "claude" } },
				},
			],
		});
	}
	return store;
}

describe("storedPanesTheHostClosed", () => {
	it("closes panes from the database whose chat the box closed or never had, and nothing else", () => {
		const store = storeWithChats("open", "replaced", "unknown", "mine");
		const tabs = store.getState().tabs;
		const found = storedPanesTheHostClosed({
			sessions: [
				{ sessionId: "open", closedAt: null },
				{ sessionId: "replaced", closedAt: 1_000 },
				{ sessionId: "mine", closedAt: 1_000 },
			],
			tabs,
			storedSessionIds: new Set(["open", "replaced", "unknown"]),
		});
		expect(
			found.map(({ tabId }) => tabs.findIndex((tab) => tab.id === tabId)),
		).toEqual([1, 2]);
	});
});
