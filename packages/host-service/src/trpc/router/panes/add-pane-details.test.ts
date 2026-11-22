import { describe, expect, test } from "bun:test";
import { addPaneDetails } from "./add-pane-details";

describe("addPaneDetails", () => {
	test("gives terminal panes their title and agent state, and leaves other panes alone", () => {
		const result = addPaneDetails(
			{
				paneId: null,
				tabId: null,
				layout: {
					activeTabId: "tab",
					tabs: [
						{
							id: "tab",
							title: null,
							active: true,
							activePaneId: "a",
							layout: { type: "pane", paneId: "a" },
							panes: [
								{
									id: "a",
									kind: "terminal",
									title: null,
									terminalId: "t1",
									active: true,
								},
								{
									id: "b",
									kind: "terminal",
									title: null,
									terminalId: "t2",
									active: false,
								},
								{
									id: "c",
									kind: "browser",
									title: "Docs",
									terminalId: null,
									active: false,
								},
							],
						},
					],
				},
			},
			{
				titles: new Map([
					["t1", "claude"],
					["t2", "zsh"],
				]),
				agents: new Map([
					["t1", { agentId: "claude", lastEventType: "PermissionRequest" }],
				]),
			},
		);
		const [a, b, c] = result.layout.tabs[0]?.panes ?? [];
		expect(a).toMatchObject({
			terminalTitle: "claude",
			agent: { id: "claude", state: "blocked" },
		});
		expect(b).toMatchObject({ terminalTitle: "zsh", agent: null });
		expect(c).not.toHaveProperty("agent");
	});

	test("fills in sidebar terminal panes too", () => {
		const tab = {
			id: "side",
			title: null,
			active: true,
			activePaneId: "s",
			layout: { type: "pane" as const, paneId: "s" },
			panes: [
				{
					id: "s",
					kind: "terminal",
					title: null,
					terminalId: "t3",
					active: true,
				},
			],
		};
		const result = addPaneDetails(
			{
				paneId: null,
				tabId: null,
				layout: {
					activeTabId: null,
					tabs: [],
					sidebar: {
						open: true,
						fullScreen: false,
						activeTabId: "side",
						tabs: [tab],
					},
				},
			},
			{ titles: new Map([["t3", "npm test"]]), agents: new Map() },
		);
		expect(result.layout.sidebar?.tabs[0]?.panes[0]).toMatchObject({
			terminalTitle: "npm test",
			agent: null,
		});
	});
});
