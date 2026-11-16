import { describe, expect, it } from "bun:test";
import type {
	PaneLayoutOpResult,
	PaneLayoutPane,
} from "@superset/shared/pane-layout-ops";
import { closeSetupPane } from "./close-setup-pane";

function layoutWith(panes: Array<Pick<PaneLayoutPane, "id" | "terminalId">>) {
	return {
		paneId: null,
		tabId: null,
		layout: {
			activeTabId: "tab-1",
			tabs: [
				{
					id: "tab-1",
					title: null,
					active: true,
					layout: null,
					panes: panes.map((pane) => ({
						...pane,
						kind: "terminal",
						title: null,
						active: false,
					})),
				},
			],
		},
	} as unknown as PaneLayoutOpResult;
}

function fakePanes(layouts: Array<PaneLayoutOpResult | Error>) {
	const closed: string[] = [];
	let listCalls = 0;
	return {
		closed,
		get listCalls() {
			return listCalls;
		},
		api: {
			list: async () => {
				const next = layouts[Math.min(listCalls++, layouts.length - 1)];
				if (next instanceof Error) throw next;
				return next as PaneLayoutOpResult;
			},
			close: async ({ paneId }: { paneId: string }) => {
				closed.push(paneId);
			},
		},
	};
}

const args = { workspaceId: "ws", terminalId: "setup", retryDelayMs: 0 };

describe("closeSetupPane", () => {
	it("closes the pane that shows the setup terminal", async () => {
		const panes = fakePanes([
			layoutWith([
				{ id: "agent-pane", terminalId: "agent" },
				{ id: "setup-pane", terminalId: "setup" },
			]),
		]);
		expect(
			await closeSetupPane({ ...args, panes: panes.api, attempts: 3 }),
		).toBe(true);
		expect(panes.closed).toEqual(["setup-pane"]);
	});

	it("retries until the desktop has written the pane", async () => {
		const panes = fakePanes([
			new Error("desktop busy"),
			layoutWith([]),
			layoutWith([{ id: "setup-pane", terminalId: "setup" }]),
		]);
		expect(
			await closeSetupPane({ ...args, panes: panes.api, attempts: 5 }),
		).toBe(true);
		expect(panes.listCalls).toBe(3);
		expect(panes.closed).toEqual(["setup-pane"]);
	});

	it("gives up without closing anything when the pane never shows up", async () => {
		const panes = fakePanes([
			layoutWith([{ id: "other", terminalId: "other" }]),
		]);
		expect(
			await closeSetupPane({ ...args, panes: panes.api, attempts: 3 }),
		).toBe(false);
		expect(panes.listCalls).toBe(3);
		expect(panes.closed).toEqual([]);
	});
});
