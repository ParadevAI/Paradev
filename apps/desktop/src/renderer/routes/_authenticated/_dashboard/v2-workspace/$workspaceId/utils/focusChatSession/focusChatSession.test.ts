import { describe, expect, it } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { ChatPaneData, PaneViewerData } from "../../types";
import {
	isChatSessionClosed,
	markChatSessionClosed,
} from "../closedChatSessions";
import { addPendingChatStop, readPendingChatStops } from "../pendingChatStops";
import { focusChatSession } from "./focusChatSession";

const session = {
	sessionId: "chat-1",
	presetId: "claude",
	harnessSessionId: "native-1",
	title: "Automation run",
};
const newStore = () => createWorkspaceStore<PaneViewerData>();

describe("focusChatSession", () => {
	it("opens an exact runtime session with its native id, title, and a fresh terminal id", () => {
		const store = newStore();
		markChatSessionClosed(session.sessionId);
		expect(focusChatSession({ store, session })).toBe("added");
		const tab = store.getState().tabs[0];
		if (!tab) throw new Error("Expected a chat tab");
		const data = Object.values(tab.panes)[0]?.data as ChatPaneData;
		expect(data).toMatchObject({
			sessionId: "chat-1",
			agent: { id: "claude", sessionId: "native-1" },
			chatTitle: "Automation run",
		});
		expect(data.terminalId).toBeTruthy();
		expect(data.terminalId).not.toBe(session.sessionId);
		expect(isChatSessionClosed(session.sessionId)).toBe(false);
	});

	it("focuses an existing linked pane and clears closed and pending stop flags", () => {
		const store = newStore();
		const linked = newStore();
		focusChatSession({
			store: linked,
			session: { ...session, terminalId: "live-terminal" },
		});
		linked.getState().addTab({
			panes: [{ kind: "terminal", data: { terminalId: "other" } }],
		});
		markChatSessionClosed(session.sessionId);
		addPendingChatStop("workspace-1", session.sessionId);
		expect(focusChatSession({ store, linkedStores: [linked], session })).toBe(
			"focused",
		);
		expect(store.getState().tabs).toHaveLength(0);
		expect(linked.getState().tabs).toHaveLength(2);
		expect(linked.getState().activeTabId).toBe(linked.getState().tabs[0]?.id);
		expect(isChatSessionClosed(session.sessionId)).toBe(false);
		expect(readPendingChatStops("workspace-1")).not.toContain(
			session.sessionId,
		);
	});

	it("reuses a discovered native session only for the same preset", () => {
		const store = newStore();
		focusChatSession({ store, session: { ...session, sessionId: null } });
		expect(focusChatSession({ store, session })).toBe("focused");
		expect(
			focusChatSession({
				store,
				session: { ...session, sessionId: "chat-2", presetId: "codex" },
			}),
		).toBe("added");
	});
});
