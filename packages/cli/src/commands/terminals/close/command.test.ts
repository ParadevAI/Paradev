import { beforeEach, describe, expect, mock, test } from "bun:test";
import { withLocalHostService } from "../../../lib/host/test-helpers";
import command from "./command";

const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const pane = (id: string, terminalId: string | null) => ({
	id,
	kind: "terminal",
	title: null,
	terminalId,
	active: false,
});
const layout = {
	activeTabId: "tab-1",
	tabs: [
		{
			id: "tab-1",
			title: null,
			active: true,
			activePaneId: "pane-agent",
			layout: { type: "pane", paneId: "pane-agent" },
			panes: [
				pane("pane-agent", "term-agent"),
				pane("pane-child", "term-child"),
			],
		},
	],
};
let listError: Error | null = null;

const killSession = mock(async () => ({ success: true }));
const close = mock(async (_input: unknown) => ({
	paneId: null,
	tabId: null,
	layout,
}));

withLocalHostService("org-1", {
	"workspace.list": () => [{ id: WORKSPACE_ID }],
	"terminal.killSession": killSession as never,
	"panes.list": () => {
		if (listError) throw listError;
		return { paneId: null, tabId: null, layout };
	},
	"panes.close": close as never,
});

function invoke(terminal: string) {
	return command.run({
		ctx: { config: { organizationId: "org-1" }, bearer: "bearer" } as never,
		args: {} as never,
		options: { workspace: WORKSPACE_ID, local: true, terminal } as never,
		signal: new AbortController().signal,
	});
}

beforeEach(() => {
	listError = null;
	killSession.mockClear();
	close.mockClear();
});

describe("terminals close", () => {
	test("closes the pane that shows the terminal, then ends the terminal", async () => {
		await invoke("term-child");
		expect(close.mock.calls).toEqual([
			[{ workspaceId: WORKSPACE_ID, paneId: "pane-child", keepTerminal: true }],
		]);
		expect(killSession).toHaveBeenLastCalledWith({
			workspaceId: WORKSPACE_ID,
			terminalId: "term-child",
		});
	});

	test("still ends the terminal when no desktop app shows panes", async () => {
		listError = new Error(
			"This host has no pane layout to edit (no desktop app is attached to it).",
		);
		await invoke("term-child");
		expect(close).not.toHaveBeenCalled();
		expect(killSession).toHaveBeenCalledTimes(1);
	});
});
