import { describe, expect, it } from "bun:test";
import {
	type CreatePaneInput,
	createWorkspaceStore,
	type WorkspaceState,
} from "@superset/panes";
import {
	type ChatPaneData,
	type PaneViewerData,
	PENDING_CLOUD_LAUNCH_PANE_KIND,
} from "../../../../types";
import type { ListedChatSession } from "../chatConversations";
import {
	type ReconcileAgentTabsInput,
	reconcileAgentTabs,
} from "./reconcileAgentTabs";

type Layout = WorkspaceState<PaneViewerData>;

const chat = (
	sessionId: string,
	overrides: Partial<ListedChatSession> = {},
): ListedChatSession => ({
	sessionId,
	harness: "claude-acp",
	harnessSessionId: `native-${sessionId}`,
	title: `Chat ${sessionId}`,
	updatedAt: 100,
	live: true,
	terminalId: `terminal-${sessionId}`,
	closedAt: null,
	closedByUser: false,
	...overrides,
});

const chatPane = (
	terminalId: string,
	sessionId: string | null,
): CreatePaneInput<PaneViewerData> => ({
	kind: "chat-v3",
	data: { terminalId, sessionId, agent: { id: "claude" } } as ChatPaneData,
});
const terminalPane = (terminalId: string): CreatePaneInput<PaneViewerData> => ({
	kind: "terminal",
	data: { terminalId },
});
const pendingPane = (terminalId: string): CreatePaneInput<PaneViewerData> => ({
	kind: PENDING_CLOUD_LAUNCH_PANE_KIND,
	data: { draftId: "draft", agentId: "claude", terminalId },
});
const filePane: CreatePaneInput<PaneViewerData> = {
	kind: "file",
	data: { filePath: "README.md", mode: "editor" },
};

function layout(
	...tabs: [
		CreatePaneInput<PaneViewerData>,
		...CreatePaneInput<PaneViewerData>[],
	][]
): Layout {
	const store = createWorkspaceStore<PaneViewerData>();
	for (const panes of tabs) store.getState().addTab({ panes });
	const { version, tabs: built, activeTabId } = store.getState();
	return { version, tabs: built, activeTabId };
}

const noHiding = {
	chatSession: () => false,
	chatTerminal: () => false,
	terminal: () => false,
	reopened: () => false,
};

function reconcile(overrides: Partial<ReconcileAgentTabsInput> = {}) {
	return reconcileAgentTabs({
		main: layout(),
		linked: [],
		presetFor: (harness) => (harness === "claude-acp" ? "claude" : null),
		hiding: noHiding,
		openedEmpty: false,
		...overrides,
	});
}

const shown = (state: Layout) =>
	state.tabs.flatMap((tab) =>
		Object.values(tab.panes).map((pane) => {
			const data = pane.data as Partial<ChatPaneData>;
			return pane.kind === "chat-v3"
				? `chat:${data.sessionId}@${data.terminalId}`
				: `${pane.kind}:${data.terminalId ?? ""}`;
		}),
	);

describe("reconcileAgentTabs", () => {
	it("gives every open chat and terminal a tab, oldest first", () => {
		const result = reconcile({
			chats: [chat("new", { updatedAt: 300 }), chat("old", { updatedAt: 100 })],
			terminals: [{ terminalId: "shell", createdAt: 200 }],
		});
		expect(shown(result.main)).toEqual([
			"chat:old@terminal-old",
			"terminal:shell",
			"chat:new@terminal-new",
		]);
	});

	it("opens a finished chat, and one with no terminal under its session id", () => {
		const result = reconcile({
			chats: [
				chat("finished", { live: false, terminalId: null }),
				chat("mobile", { terminalId: null, updatedAt: 200 }),
			],
		});
		expect(shown(result.main)).toEqual([
			"chat:finished@finished",
			"chat:mobile@mobile",
		]);
	});

	it("gives a conversation one tab however many sessions its terminal ran", () => {
		const result = reconcile({
			chats: [
				chat("rewound-from", {
					live: false,
					launchTerminalId: "t",
					terminalId: null,
					updatedAt: 100,
				}),
				chat("rewound-to", { terminalId: "t", updatedAt: 200 }),
				chat("restarted", {
					live: false,
					terminalId: null,
					launchTerminalId: "t",
					updatedAt: 50,
				}),
			],
		});
		expect(shown(result.main)).toEqual(["chat:rewound-to@t"]);
	});

	it("opens a stopped conversation on the terminal it launched under", () => {
		const result = reconcile({
			chats: [
				chat("stopped", {
					live: false,
					terminalId: null,
					launchTerminalId: "launch",
				}),
			],
		});
		expect(shown(result.main)).toEqual(["chat:stopped@launch"]);
	});

	it("leaves closed, unsupported and hidden conversations alone", () => {
		const result = reconcile({
			chats: [
				chat("closed-by-host", { live: false, closedAt: 5 }),
				chat("closed-by-user", { live: false, closedByUser: true }),
				chat("unknown", { harness: "unknown" }),
				chat("closed-here"),
				chat("ignored"),
			],
			terminals: [{ terminalId: "backgrounded" }],
			hiding: {
				...noHiding,
				chatSession: (id) => id === "closed-here",
				chatTerminal: (id) => id === "terminal-ignored",
				terminal: (id) => id === "backgrounded",
			},
		});
		expect(result.changed).toBe(false);
	});

	it("counts every agent pane in every area as showing its conversation", () => {
		const main = layout(
			[chatPane("other-terminal", "by-session")],
			[chatPane("terminal-creating", null)],
			[pendingPane("terminal-pending")],
		);
		const right = layout([chatPane("terminal-right", "right")]);
		const result = reconcile({
			main,
			linked: [right],
			chats: [
				chat("by-session"),
				chat("creating"),
				chat("pending-finished", {
					live: false,
					terminalId: null,
					launchTerminalId: "terminal-pending",
				}),
				chat("right"),
			],
			terminals: [{ terminalId: "terminal-right" }],
		});
		expect(result.changed).toBe(false);
	});

	it("does not open a second tab for a terminal a chat pane shows", () => {
		const result = reconcile({
			main: layout([chatPane("shared", "s")]),
			terminals: [{ terminalId: "shared" }],
		});
		expect(result.changed).toBe(false);
	});

	it("removes a chat the user closed elsewhere unless it was reopened here", () => {
		const main = layout(
			[chatPane("a", "closed")],
			[chatPane("b", "reopened")],
			[chatPane("c", "stopped")],
			[filePane],
		);
		const result = reconcile({
			main,
			chats: [
				chat("closed", { live: false, closedByUser: true }),
				chat("reopened", { live: false, closedByUser: true }),
				chat("stopped", { live: false, closedAt: 5 }),
			],
			hiding: { ...noHiding, reopened: (id) => id === "reopened" },
		});
		expect(shown(result.main)).toEqual([
			"chat:reopened@b",
			"chat:stopped@c",
			"file:",
		]);
	});

	it("removes stored cloud chats the box no longer has open", () => {
		const result = reconcile({
			main: layout([chatPane("x", "kept")], [chatPane("y", "gone")]),
			chats: [chat("kept"), chat("gone", { live: false, closedAt: 5 })],
			storedSessionIds: new Set(["kept", "gone"]),
		});
		expect(shown(result.main)).toEqual(["chat:kept@x"]);
	});

	it("collapses two panes on one conversation to the first, across areas", () => {
		const main = layout(
			[chatPane("t1", "same")],
			[terminalPane("shell")],
			[chatPane("t2", "same")],
		);
		const right = layout([terminalPane("shell")]);
		const result = reconcile({ main, linked: [right] });
		expect(shown(result.main)).toEqual(["chat:same@t1", "terminal:shell"]);
		expect(result.linked[0]?.tabs).toHaveLength(0);
	});

	it("keeps the pane in the older tab when a newer one duplicates it", () => {
		const right = layout([terminalPane("resumed")]);
		const main = layout([filePane], [terminalPane("resumed")]);
		const older = (state: Layout): Layout => ({
			...state,
			tabs: state.tabs.map((tab) => ({ ...tab, createdAt: 1 })),
		});
		const result = reconcile({ main, linked: [older(right)] });
		expect(shown(result.main)).toEqual(["file:"]);
		expect(shown(result.linked[0] as Layout)).toEqual(["terminal:resumed"]);
	});

	it("keeps the user's selected tab", () => {
		const main = layout([filePane], [terminalPane("mine")]);
		const selected = main.tabs[0]?.id;
		const result = reconcile({
			main: { ...main, activeTabId: selected ?? null },
			chats: [chat("new")],
		});
		expect(result.main.activeTabId).toBe(selected ?? null);
	});

	it("opens an empty workspace, or one with only setup terminals, on its newest chat", () => {
		for (const main of [layout(), layout([terminalPane("setup")])]) {
			const result = reconcile({
				main,
				openedEmpty: true,
				chats: [
					chat("old", { updatedAt: 1 }),
					chat("newest", { updatedAt: 9 }),
				],
				terminals: [{ terminalId: "late", createdAt: 20 }],
			});
			const active = result.main.tabs.find(
				(tab) => tab.id === result.main.activeTabId,
			);
			expect(shown({ ...result.main, tabs: active ? [active] : [] })).toEqual([
				"chat:newest@terminal-newest",
			]);
		}
	});

	it("selects the oldest new tab when nothing was selected", () => {
		const result = reconcile({
			terminals: [
				{ terminalId: "setup", createdAt: 2 },
				{ terminalId: "agent", createdAt: 1 },
			],
		});
		const active = result.main.tabs.find(
			(tab) => tab.id === result.main.activeTabId,
		);
		expect(active && shown({ ...result.main, tabs: [active] })).toEqual([
			"terminal:agent",
		]);
	});

	it("never opens tabs in a linked area", () => {
		const result = reconcile({
			linked: [layout([filePane])],
			chats: [chat("new")],
		});
		expect(result.linked[0]?.tabs).toHaveLength(1);
		expect(shown(result.main)).toEqual(["chat:new@terminal-new"]);
	});
});
