import { describe, expect, it } from "bun:test";
import { appendLaunchesToPaneLayout } from "./appendLaunchesToPaneLayout";

describe("appendLaunchesToPaneLayout", () => {
	it("puts an independent agent before the setup terminal and selects it", () => {
		const state = appendLaunchesToPaneLayout({
			existing: undefined,
			terminals: [{ terminalId: "term-1", label: "Workspace Setup" }],
			agents: [
				{ ok: true, kind: "terminal", sessionId: "term-2", label: "Claude" },
			],
		});

		expect(state.tabs.map((tab) => tab.titleOverride)).toEqual([
			"Claude",
			"Workspace Setup",
		]);
		expect(state.activeTabId).toBe(state.tabs[0].id);
	});

	it("dedupes a chained agent that reuses the setup terminal to one tab", () => {
		const state = appendLaunchesToPaneLayout({
			existing: undefined,
			terminals: [{ terminalId: "term-1", label: "Workspace Setup" }],
			agents: [
				{ ok: true, kind: "terminal", sessionId: "term-1", label: "Claude" },
			],
		});

		expect(state.tabs).toHaveLength(1);
		expect(state.tabs[0].titleOverride).toBe("Workspace Setup");
	});

	it("skips failed agent launches", () => {
		const state = appendLaunchesToPaneLayout({
			existing: undefined,
			terminals: [],
			agents: [{ ok: false, error: "boom" }],
		});

		expect(state.tabs).toHaveLength(0);
	});

	it("opens a chat launch as the first, selected tab before Workspace Setup", () => {
		const state = appendLaunchesToPaneLayout({
			existing: undefined,
			terminals: [{ terminalId: "setup-1", label: "Workspace Setup" }],
			agents: [
				{
					ok: true,
					kind: "terminal",
					sessionId: "terminal-1",
					label: "Claude",
					chatSessionId: "chat-1",
					chatAgentId: "claude",
				},
			],
		});

		const [chatTab, setupTab] = state.tabs;
		const chatPane = chatTab ? Object.values(chatTab.panes)[0] : undefined;
		expect(chatPane?.kind).toBe("chat-v3");
		expect(chatPane?.data).toEqual({
			terminalId: "terminal-1",
			sessionId: "chat-1",
			agent: { id: "claude" },
		});
		expect(setupTab?.titleOverride).toBe("Workspace Setup");
		expect(state.activeTabId).toBe(chatTab?.id);
	});

	it("skips a chat launch whose agent is unknown", () => {
		const state = appendLaunchesToPaneLayout({
			existing: undefined,
			terminals: [],
			agents: [
				{
					ok: true,
					kind: "terminal",
					sessionId: "terminal-1",
					label: "Claude",
					chatSessionId: "chat-1",
				},
			],
		});

		expect(state.tabs).toHaveLength(0);
	});

	it("does not add a second tab for a launch that already has a pane", () => {
		const first = appendLaunchesToPaneLayout({
			existing: undefined,
			terminals: [{ terminalId: "setup-1", label: "Workspace Setup" }],
			agents: [],
		});
		const again = appendLaunchesToPaneLayout({
			existing: first,
			terminals: [{ terminalId: "setup-1", label: "Workspace Setup" }],
			agents: [],
		});

		expect(again.tabs).toHaveLength(1);
	});
});
