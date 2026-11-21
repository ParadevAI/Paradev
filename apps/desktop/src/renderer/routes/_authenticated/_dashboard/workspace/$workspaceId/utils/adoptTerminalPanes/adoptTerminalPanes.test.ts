import { describe, expect, it } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { PaneViewerData } from "../../types";
import { adoptTerminalPanes } from "./adoptTerminalPanes";

function tabTerminalIds(store: ReturnType<typeof emptyStore>) {
	return store
		.getState()
		.tabs.map(
			(tab) =>
				(Object.values(tab.panes)[0]?.data as { terminalId: string })
					.terminalId,
		);
}

function activeTerminalId(store: ReturnType<typeof emptyStore>) {
	const state = store.getState();
	const tab = state.tabs.find((t) => t.id === state.activeTabId);
	return (Object.values(tab?.panes ?? {})[0]?.data as { terminalId: string })
		?.terminalId;
}

function emptyStore() {
	return createWorkspaceStore<PaneViewerData>({
		initialState: { version: 1, tabs: [], activeTabId: null },
	});
}

describe("adoptTerminalPanes", () => {
	it("selects the oldest terminal when the layout was empty", () => {
		const store = emptyStore();
		adoptTerminalPanes(store, ["agent", "setup"]);
		expect(tabTerminalIds(store)).toEqual(["agent", "setup"]);
		expect(activeTerminalId(store)).toBe("agent");
	});

	it("keeps the tab the user already had selected", () => {
		const store = emptyStore();
		adoptTerminalPanes(store, ["existing"]);
		adoptTerminalPanes(store, ["agent", "setup"]);
		expect(tabTerminalIds(store)).toEqual(["existing", "agent", "setup"]);
		expect(activeTerminalId(store)).toBe("existing");
	});
});
