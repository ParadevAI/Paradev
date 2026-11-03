import { describe, expect, test } from "bun:test";
import {
	isChatSessionClosed,
	isChatTerminalClosed,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/closedChatSessions";
import type { PaneAreas } from "../applyPaneLayoutOp";
import { keepClosedPaneClosed } from "./keepClosedPaneClosed";

function areasWith(pane: { id: string; kind: string; data: unknown }) {
	return {
		main: {
			version: 1,
			activeTabId: "tab-1",
			tabs: [
				{
					id: "tab-1",
					createdAt: 1,
					activePaneId: pane.id,
					layout: { type: "pane", paneId: pane.id },
					panes: { [pane.id]: pane },
				},
			],
		},
		sidebar: { version: 1, activeTabId: null, tabs: [] },
	} as unknown as PaneAreas;
}

describe("keepClosedPaneClosed", () => {
	test("a chat pane closed on request is not adopted back while its session stops", () => {
		const areas = areasWith({
			id: "chat",
			kind: "chat-v3",
			data: { sessionId: "session-1", terminalId: "term-1" },
		});

		keepClosedPaneClosed(areas, "ws-1", {
			type: "close",
			workspaceId: "ws-1",
			paneId: "chat",
		} as never);

		expect(isChatSessionClosed("session-1")).toBe(true);
		expect(isChatTerminalClosed("term-1")).toBe(true);
	});

	test("other ops leave the chat open", () => {
		const areas = areasWith({
			id: "chat",
			kind: "chat-v3",
			data: { sessionId: "session-2", terminalId: "term-2" },
		});

		keepClosedPaneClosed(areas, "ws-1", {
			type: "focus",
			workspaceId: "ws-1",
			paneId: "chat",
		} as never);

		expect(isChatSessionClosed("session-2")).toBe(false);
	});
});
