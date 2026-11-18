import { expect, test } from "bun:test";
import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import {
	CLOUD_AGENT_LAUNCH_SURFACES,
	type CloudAgentLaunchDescriptor,
} from "@superset/shared/cloud-agent-launch";
import {
	type ChatPaneData,
	type PaneViewerData,
	PENDING_CLOUD_LAUNCH_PANE_KIND,
} from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/types";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import {
	attachCloudChatSession,
	attachCloudTerminal,
	pendingCloudLaunchPane,
	pendingLaunchSurface,
	releasePendingCloudChat,
	seedPendingCloudLaunch,
} from "./pendingCloudLaunch";

type Row = { workspaceId: string; paneLayout: WorkspaceState<PaneViewerData> };
const launch: CloudAgentLaunchDescriptor = {
	agent: "claude",
	surface: "chat",
	promptHash: "initial-prompt-hash",
	terminalId: "promised-terminal",
};

function collections() {
	const rows = new Map<string, Row>();
	const result = {
		workspaceLocalState: {
			state: rows,
			get: (id: string) => rows.get(id),
			insert: (row: Row) => rows.set(row.workspaceId, structuredClone(row)),
			update: (id: string, update: (row: Row) => void) => {
				const row = rows.get(id);
				if (!row) throw new Error("missing row");
				const next = structuredClone(row);
				update(next);
				rows.set(id, next);
			},
		},
		sidebarSections: { state: new Map() },
	} as unknown as AppCollections;
	return { collections: result, rows };
}

test("a confirmed cloud chat has a waiting pane before any host session exists", () => {
	const state = collections();
	const seed = () =>
		seedPendingCloudLaunch({
			collections: state.collections,
			workspaceId: "new-cloud",
			launch,
		});
	seed();
	seed();
	const layout = state.rows.get("new-cloud")?.paneLayout;
	const pending = pendingCloudLaunchPane(layout);
	expect(layout?.tabs).toHaveLength(1);
	expect(pending?.kind).toBe(PENDING_CLOUD_LAUNCH_PANE_KIND);
	expect(pending?.data).toMatchObject({
		agentId: "claude",
		terminalId: "promised-terminal",
	});
	expect(pending?.data).not.toHaveProperty("sessionId");
	expect(pending?.data).not.toHaveProperty("pendingPrompt");
});

test("every launch surface gets a waiting pane that records its surface", () => {
	for (const surface of CLOUD_AGENT_LAUNCH_SURFACES) {
		const state = collections();
		seedPendingCloudLaunch({
			collections: state.collections,
			workspaceId: surface,
			launch: { ...launch, surface },
		});
		const pending = pendingCloudLaunchPane(state.rows.get(surface)?.paneLayout);
		expect(pending?.data).toMatchObject({
			surface,
			terminalId: "promised-terminal",
		});
		expect(
			pendingLaunchSurface(pending?.data ?? { draftId: "", agentId: "" }),
		).toBe(surface);
	}
});

test("a waiting pane saved before panes had a surface reads as chat", () => {
	expect(pendingLaunchSurface({ draftId: "d", agentId: "claude" })).toBe(
		"chat",
	);
});

test("older APIs and unpromised ids do not seed a waiting pane", () => {
	const state = collections();
	for (const [id, descriptor] of [
		["old-api", undefined],
		["no-agent", null],
		["no-terminal-id", { ...launch, terminalId: null }],
	] as const) {
		seedPendingCloudLaunch({
			collections: state.collections,
			workspaceId: id,
			launch: descriptor,
		});
	}
	expect(state.rows.size).toBe(0);
});

test("an existing nonempty pane layout is never replaced", () => {
	const state = collections();
	const store = createWorkspaceStore<PaneViewerData>();
	store.getState().addTab({
		panes: [{ kind: "terminal", data: { terminalId: "existing" } }],
	});
	const { version, tabs, activeTabId } = store.getState();
	const original = { version, tabs, activeTabId };
	state.rows.set("existing-cloud", {
		workspaceId: "existing-cloud",
		paneLayout: original,
	});
	seedPendingCloudLaunch({
		collections: state.collections,
		workspaceId: "existing-cloud",
		launch,
	});
	expect(state.rows.get("existing-cloud")?.paneLayout).toEqual(original);
});

test("attaching preserves the pane, tab, draft, queued messages and model without replaying the initial prompt", () => {
	const state = collections();
	seedPendingCloudLaunch({
		collections: state.collections,
		workspaceId: "handoff",
		launch,
		modelId: "chosen-model",
		modeId: "plan",
	});
	const layout = state.rows.get("handoff")?.paneLayout;
	if (!layout) throw new Error("missing seeded layout");
	const pending = pendingCloudLaunchPane(layout);
	if (!pending) throw new Error("missing pending pane");
	pending.data.queuedPrompts = [
		[{ type: "text", text: "typed while starting" }],
	];
	const session = {
		sessionId: "host-chat",
		terminalId: "host-terminal",
		harnessSessionId: "agent-native-id",
		title: "Live conversation",
	};
	const next = attachCloudChatSession(layout, pending.id, session);
	const pane = next.tabs[0]?.panes[pending.id];
	const data = pane?.data as ChatPaneData;
	expect(next.tabs).toHaveLength(1);
	expect(next.tabs[0]?.id).toBe(layout.tabs[0]?.id);
	expect(next.activeTabId).toBe(layout.activeTabId);
	expect(pane?.id).toBe(pending.id);
	expect(pane?.kind).toBe("chat-v3");
	expect(data).toMatchObject({
		sessionId: "host-chat",
		terminalId: "host-terminal",
		draftId: pending.data.draftId,
		queuedPrompts: pending.data.queuedPrompts,
		chatModelId: "chosen-model",
		chatModeId: "plan",
	});
	expect(data).not.toHaveProperty("pendingPrompt");
	expect(pendingCloudLaunchPane(next)).toBeNull();
	expect(attachCloudChatSession(next, pending.id, session)).toEqual(next);
});

test("releasing a waiting chat keeps the pane and what was typed but starts its own session", () => {
	const state = collections();
	seedPendingCloudLaunch({
		collections: state.collections,
		workspaceId: "release",
		launch,
		modelId: "chosen-model",
	});
	const layout = state.rows.get("release")?.paneLayout;
	const pending = layout && pendingCloudLaunchPane(layout);
	if (!layout || !pending) throw new Error("missing pending pane");
	pending.data.queuedPrompts = [[{ type: "text", text: "typed" }]];
	const next = releasePendingCloudChat(layout, pending.id);
	const pane = next.tabs[0]?.panes[pending.id];
	expect(pane?.kind).toBe("chat-v3");
	expect(pane?.titleOverride).toBeUndefined();
	expect(pane?.data).toMatchObject({
		draftId: pending.data.draftId,
		sessionId: null,
		agent: { id: "claude" },
		queuedPrompts: [[{ type: "text", text: "typed" }]],
		chatModelId: "chosen-model",
	});
	expect((pane?.data as ChatPaneData).terminalId).not.toBe(
		pending.data.draftId,
	);
});

test("the typed prompt goes to the chat that got it, not to a fresh one", () => {
	const state = collections();
	seedPendingCloudLaunch({
		collections: state.collections,
		workspaceId: "typed",
		launch,
		prompt: "fix the login bug",
	});
	const layout = state.rows.get("typed")?.paneLayout;
	const pending = layout && pendingCloudLaunchPane(layout);
	if (!layout || !pending) throw new Error("missing pending pane");
	expect(pending.data.launchPrompt).toBe("fix the login bug");
	const attached = attachCloudChatSession(layout, pending.id, {
		sessionId: "host-chat",
		terminalId: null,
		harnessSessionId: null,
		title: null,
	});
	expect(
		(attached.tabs[0]?.panes[pending.id]?.data as ChatPaneData).launchPrompt,
	).toBe("fix the login bug");
	const released = releasePendingCloudChat(layout, pending.id);
	expect(released.tabs[0]?.panes[pending.id]?.data).not.toHaveProperty(
		"launchPrompt",
	);
});

test("a launch that fell back to a terminal turns the waiting pane into that terminal", () => {
	const state = collections();
	seedPendingCloudLaunch({
		collections: state.collections,
		workspaceId: "terminal-fallback",
		launch,
	});
	const layout = state.rows.get("terminal-fallback")?.paneLayout;
	const pending = layout && pendingCloudLaunchPane(layout);
	if (!layout || !pending) throw new Error("missing pending pane");
	const next = attachCloudTerminal(layout, pending.id, "promised-terminal");
	const pane = next.tabs[0]?.panes[pending.id];
	expect(pane?.kind).toBe("terminal");
	expect(pane?.data).toEqual({ terminalId: "promised-terminal" });
	expect(pendingCloudLaunchPane(next)).toBeNull();
});
