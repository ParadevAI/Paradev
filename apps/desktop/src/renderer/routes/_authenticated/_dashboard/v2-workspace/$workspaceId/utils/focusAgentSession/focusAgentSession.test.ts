import { describe, expect, it } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { ChatPaneData, PaneViewerData } from "../../types";
import { focusAgentSession } from "./focusAgentSession";

const session = { id: "agent-session-1", agentName: "Builder" };

describe("focusAgentSession", () => {
	it("opens an agent session once, then focuses its tab", () => {
		const store = createWorkspaceStore<PaneViewerData>();
		expect(focusAgentSession({ store, session })).toBe("added");
		expect(focusAgentSession({ store, session })).toBe("focused");
		const tabs = store.getState().tabs;
		expect(tabs).toHaveLength(1);
		const data = Object.values(tabs[0]?.panes ?? {})[0]?.data as ChatPaneData;
		expect(data.agentSession).toEqual(session);
	});
});
