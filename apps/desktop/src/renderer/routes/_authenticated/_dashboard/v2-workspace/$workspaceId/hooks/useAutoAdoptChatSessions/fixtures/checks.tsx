import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { ChatTransport } from "@superset/chat/client";
import type { Item, UserMessage } from "@superset/chat/protocol";
import type { WorkspaceStore } from "@superset/panes";
import type { QueryClient as QueryClientType } from "@tanstack/react-query";
import type { StoreApi } from "zustand";
import type { PaneViewerData } from "../../../types";

const timers = {
	setTimeout: globalThis.setTimeout,
	clearTimeout: globalThis.clearTimeout,
	setInterval: globalThis.setInterval,
	clearInterval: globalThis.clearInterval,
	queueMicrotask: globalThis.queueMicrotask,
};
const registered = GlobalRegistrator.isRegistered;
if (!registered) GlobalRegistrator.register();
Object.assign(globalThis, timers);
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const { useEffect } = await import("react");
const { QueryClient, QueryClientProvider } = await import(
	"@tanstack/react-query"
);
const { act, cleanup, render, waitFor } = await import(
	"@testing-library/react"
);
const { createWorkspaceStore } = await import("@superset/panes");
const { acpHarnessForPreset, emptySnapshot, outlineSnapshot } = await import(
	"@superset/chat/core"
);
const { hashCloudAgentPrompt } = await import(
	"@superset/shared/cloud-agent-launch"
);
const { PENDING_CLOUD_CHAT_PANE_KIND } = await import("../../../types");
const { isChatSessionClosed, markCloudChatLaunchClosed } = await import(
	"../../../utils/closedChatSessions"
);

type PaneStore = StoreApi<WorkspaceStore<PaneViewerData>>;
type Session = Awaited<ReturnType<ChatTransport["listSessions"]>>[number];
const hostUrl = "https://sandbox";
let sessions: Session[] = [];
const outlines = new Map<string, Item[]>();
let reads = 0;
let outlineReads = 0;
let creates = 0;
const changes = new Set<() => void>();
const connectionListeners = new Set<() => void>();
let refs = 0;
let chatAvailability: "enabled" | "disabled" = "enabled";
type Binding = {
	terminalId: string;
	agentId: string;
	chatSessionId?: string;
	endedAt?: number;
};
let terminalAgents = new Map<string, Binding>();
const connectionStatus = { state: "open" };
const transport = {
	listSessions: async () => {
		reads++;
		return sessions;
	},
	getOutline: async ({ sessionId }: { sessionId: string }) => {
		outlineReads++;
		return {
			ok: true,
			outline: {
				...outlineSnapshot(emptySnapshot()),
				items: (outlines.get(sessionId) ?? []).map((item) => ({
					item,
					turnId: "turn",
				})),
			},
		};
	},
	getItems: async () => {
		throw new Error("outline should be available");
	},
	createSession: async () => {
		creates++;
		throw new Error("must attach, never create");
	},
};
mock.module("@superset/workspace-client", () => ({
	useWorkspaceClient: () => ({ hostUrl }),
}));
mock.module("renderer/hooks/useAcpChatEnabled", () => ({
	useAcpChatEnabled: () => chatAvailability,
}));
mock.module("renderer/hooks/host-service/useWorkspaceHostUrl", () => ({
	useWorkspaceHostUrl: () => hostUrl,
}));
mock.module("renderer/lib/host-event-bus", () => ({
	getHostEventBus: () => ({
		getConnectionStatus: () => connectionStatus,
		subscribeConnectionStatus: (callback: () => void) => {
			connectionListeners.add(callback);
			return () => connectionListeners.delete(callback);
		},
		retain: () => {
			refs++;
			return () => refs--;
		},
	}),
}));
mock.module("renderer/hooks/host-service/useTerminalAgentBindings", () => ({
	useTerminalAgentBindings: () => terminalAgents,
}));
mock.module("renderer/hooks/host-service/useWorkspaceEvent", () => ({
	useWorkspaceEvent: (
		_type: string,
		_workspaceId: string,
		callback: () => void,
		enabled: boolean,
	) => {
		useEffect(() => {
			if (!enabled) return;
			changes.add(callback);
			return () => {
				changes.delete(callback);
			};
		}, [callback, enabled]);
	},
}));
mock.module(
	"../../usePaneRegistry/components/ChatSession/hooks/useSessionClient",
	() => ({ useChatWiring: () => ({ transport }) }),
);
const { prependToDraft } = await import(
	"../../usePaneRegistry/components/ChatSession/components/Composer/hooks/useComposerDraft"
);
const { useAutoAdoptChatSessions } = await import(
	"../useAutoAdoptChatSessions"
);
const clients: QueryClientType[] = [];
function Probe({
	store,
	workspaceId,
	linkedStores,
	pendingTimeoutMs,
}: {
	store: PaneStore;
	workspaceId: string;
	linkedStores: PaneStore[];
	pendingTimeoutMs?: number;
}) {
	useAutoAdoptChatSessions({
		store,
		workspaceId,
		linkedStores,
		isLayoutReady: true,
		pendingTimeoutMs,
	});
	return null;
}
function show(
	store: PaneStore,
	workspaceId: string,
	linkedStores: PaneStore[] = [],
	pendingTimeoutMs?: number,
) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
	});
	clients.push(client);
	return render(
		<QueryClientProvider client={client}>
			<Probe
				store={store}
				workspaceId={workspaceId}
				linkedStores={linkedStores}
				pendingTimeoutMs={pendingTimeoutMs}
			/>
		</QueryClientProvider>,
	);
}
async function waitingPane(queued = true, draftId = "stable-draft") {
	const store = createWorkspaceStore<PaneViewerData>();
	const promptHash = await hashCloudAgentPrompt("initial prompt");
	store.getState().addTab({
		panes: [
			{
				kind: PENDING_CLOUD_CHAT_PANE_KIND,
				data: {
					draftId,
					agentId: "claude",
					promptHash,
					...(queued
						? { queuedPrompts: [[{ type: "text", text: "follow-up" }]] }
						: {}),
				},
			},
		],
	});
	const tab = store.getState().tabs[0];
	const pane = Object.values(tab?.panes ?? {})[0];
	if (!tab || !pane) throw new Error("missing pane");
	return { store, tabId: tab.id, paneId: pane.id, promptHash };
}
function session(id: string): Session {
	return {
		sessionId: id,
		scopeId: "workspace",
		harness: acpHarnessForPreset("claude") ?? "claude-acp",
		harnessSessionId: null,
		epoch: "epoch",
		status: "starting",
		title: null,
		queuedCount: 1,
		updatedAt: 1,
		live: true,
		terminalId: `terminal-${id}`,
	};
}
function message(clientId: string, text: string): UserMessage {
	return {
		id: clientId,
		kind: "user_message",
		clientId,
		startedAtMs: 1,
		content: [{ type: "text", text }],
	};
}
async function changed() {
	await act(async () => {
		for (const callback of changes) callback();
	});
}

afterEach(() => {
	cleanup();
	for (const client of clients.splice(0)) client.clear();
	expect(refs).toBe(0);
	expect(connectionListeners.size).toBe(0);
	expect(changes.size).toBe(0);
	sessions = [];
	outlines.clear();
	reads = 0;
	outlineReads = 0;
	creates = 0;
	chatAvailability = "enabled";
	terminalAgents = new Map();
	localStorage.clear();
});
afterAll(async () => {
	if (!registered) await GlobalRegistrator.unregister();
});

test("the host launch attaches once in place and does not resend the launch prompt", async () => {
	const pending = await waitingPane();
	show(pending.store, "attach-workspace");
	await waitFor(() => expect(reads).toBe(1));
	expect(pending.store.getState().tabs).toHaveLength(1);
	sessions = [session("initial")];
	await changed();
	await waitFor(() => expect(reads).toBe(2));
	expect(pending.store.getState().tabs[0]?.panes[pending.paneId]?.kind).toBe(
		PENDING_CLOUD_CHAT_PANE_KIND,
	);
	outlines.set("initial", [message("superset-sessions", "initial prompt")]);
	await changed();
	await waitFor(() =>
		expect(pending.store.getState().tabs[0]?.panes[pending.paneId]?.kind).toBe(
			"chat-v3",
		),
	);
	const state = pending.store.getState();
	expect(state.tabs).toHaveLength(1);
	expect(state.tabs[0]?.id).toBe(pending.tabId);
	expect(state.activeTabId).toBe(pending.tabId);
	expect(state.tabs[0]?.panes[pending.paneId]?.data).toMatchObject({
		draftId: "stable-draft",
		sessionId: "initial",
		queuedPrompts: [[{ type: "text", text: "follow-up" }]],
	});
	expect(state.tabs[0]?.panes[pending.paneId]?.data).not.toHaveProperty(
		"pendingPrompt",
	);
	await changed();
	await waitFor(() => expect(reads).toBeGreaterThanOrEqual(4));
	expect(pending.store.getState().tabs).toHaveLength(1);
	expect(creates).toBe(0);
});

test("a collaborator's chat is adopted separately and never replaces the waiting launch", async () => {
	const pending = await waitingPane();
	sessions = [session("collaborator")];
	outlines.set("collaborator", [message("desktop-client", "initial prompt")]);
	show(pending.store, "collaborative-workspace");
	await waitFor(() => expect(pending.store.getState().tabs).toHaveLength(2));
	expect(pending.store.getState().tabs[0]?.panes[pending.paneId]?.kind).toBe(
		PENDING_CLOUD_CHAT_PANE_KIND,
	);
	sessions = [...sessions, session("own-launch")];
	outlines.set("own-launch", [message("superset-sessions", "initial prompt")]);
	await changed();
	await waitFor(() =>
		expect(
			pending.store.getState().tabs[0]?.panes[pending.paneId]?.data,
		).toMatchObject({ sessionId: "own-launch" }),
	);
	expect(pending.store.getState().tabs).toHaveLength(2);
	expect(pending.store.getState().activeTabId).toBe(pending.tabId);
	expect(creates).toBe(0);
});

test("closing a waiting pane does not reopen it when the launch arrives", async () => {
	const pending = await waitingPane();
	const workspaceId = "closed-workspace";
	show(pending.store, workspaceId);
	await waitFor(() => expect(reads).toBe(1));
	markCloudChatLaunchClosed(workspaceId, pending.promptHash);
	act(() =>
		pending.store
			.getState()
			.closePane({ tabId: pending.tabId, paneId: pending.paneId }),
	);
	sessions = [session("closed-initial")];
	outlines.set("closed-initial", [
		message("superset-sessions", "initial prompt"),
	]);
	await changed();
	await waitFor(() => expect(isChatSessionClosed("closed-initial")).toBe(true));
	expect(pending.store.getState().tabs).toHaveLength(0);
	expect(creates).toBe(0);
});

test("a launch that never arrives turns the waiting pane into a normal new chat", async () => {
	const pending = await waitingPane();
	show(pending.store, "silent-workspace", [], 30);
	await waitFor(() =>
		expect(pending.store.getState().tabs[0]?.panes[pending.paneId]?.kind).toBe(
			"chat-v3",
		),
	);
	const state = pending.store.getState();
	expect(state.tabs).toHaveLength(1);
	expect(state.tabs[0]?.panes[pending.paneId]?.data).toMatchObject({
		draftId: "stable-draft",
		sessionId: null,
		agent: { id: "claude" },
		queuedPrompts: [[{ type: "text", text: "follow-up" }]],
	});
	expect(reads).toBeGreaterThanOrEqual(2);
});

test("a launch whose stored prompt differs is held back and attached at the deadline", async () => {
	const pending = await waitingPane();
	sessions = [session("edited-launch")];
	outlines.set("edited-launch", [
		message("superset-sessions", "initial prompt, normalised"),
	]);
	show(pending.store, "mismatch-workspace", [], 30);
	await waitFor(() => expect(reads).toBe(1));
	expect(pending.store.getState().tabs).toHaveLength(1);
	await waitFor(() =>
		expect(
			pending.store.getState().tabs[0]?.panes[pending.paneId]?.data,
		).toMatchObject({ sessionId: "edited-launch", draftId: "stable-draft" }),
	);
	expect(pending.store.getState().tabs).toHaveLength(1);
	expect(creates).toBe(0);
});

test("turning agent chat off removes the waiting pane instead of leaving it stuck", async () => {
	chatAvailability = "disabled";
	const pending = await waitingPane();
	show(pending.store, "disabled-workspace");
	await waitFor(() => expect(pending.store.getState().tabs).toHaveLength(0));
	expect(reads).toBe(0);
});

test("a chat with no message yet backs off, and each first prompt is read once", async () => {
	const pending = await waitingPane();
	sessions = [session("empty")];
	show(pending.store, "unresolved-workspace");
	const polls = () =>
		clients[0]?.getQueryData<{ unresolvedPolls: number }>([
			"chat-v3",
			hostUrl,
			"paneSessions",
			"unresolved-workspace",
		])?.unresolvedPolls;
	await waitFor(() => expect(polls()).toBe(1));
	await changed();
	await waitFor(() => expect(polls()).toBe(2));
	outlines.set("empty", [message("desktop-client", "hello")]);
	await changed();
	await waitFor(() => expect(polls()).toBe(0));
	const readsAfterResolve = outlineReads;
	await changed();
	await changed();
	await waitFor(() => expect(reads).toBeGreaterThanOrEqual(5));
	expect(outlineReads).toBe(readsAfterResolve);
});

test("a launch the box ran in a terminal closes an untouched waiting pane at once", async () => {
	const pending = await waitingPane(false);
	terminalAgents = new Map([
		[
			"chat-term",
			{ terminalId: "chat-term", agentId: "claude", chatSessionId: "other" },
		],
		["old-term", { terminalId: "old-term", agentId: "claude", endedAt: 1 }],
		["codex-term", { terminalId: "codex-term", agentId: "codex" }],
	]);
	show(pending.store, "chat-binding-workspace");
	await waitFor(() => expect(reads).toBe(1));
	expect(pending.store.getState().tabs[0]?.panes[pending.paneId]?.kind).toBe(
		PENDING_CLOUD_CHAT_PANE_KIND,
	);
	terminalAgents = new Map([
		...terminalAgents,
		["launch-term", { terminalId: "launch-term", agentId: "claude" }],
	]);
	await changed();
	await waitFor(() => expect(pending.store.getState().tabs).toHaveLength(0));
	expect(creates).toBe(0);
});

test("a terminal launch keeps what was typed by releasing the pane as a chat", async () => {
	const queued = await waitingPane(true);
	terminalAgents = new Map([
		["launch-term", { terminalId: "launch-term", agentId: "claude" }],
	]);
	show(queued.store, "terminal-queued-workspace");
	await waitFor(() =>
		expect(
			queued.store.getState().tabs[0]?.panes[queued.paneId]?.data,
		).toMatchObject({
			sessionId: null,
			draftId: "stable-draft",
			queuedPrompts: [[{ type: "text", text: "follow-up" }]],
		}),
	);
	cleanup();
	const drafted = await waitingPane(false, "typed-draft");
	prependToDraft("chat-v3-draft:typed-draft", [
		{ segments: [{ type: "text", text: "half a sentence" }], attachments: [] },
	]);
	show(drafted.store, "terminal-draft-workspace");
	await waitFor(() =>
		expect(drafted.store.getState().tabs[0]?.panes[drafted.paneId]?.kind).toBe(
			"chat-v3",
		),
	);
});

test("an attached launch is already known live, so the chat does not show a resume notice", async () => {
	const pending = await waitingPane();
	sessions = [session("seeded")];
	outlines.set("seeded", [message("superset-sessions", "initial prompt")]);
	show(pending.store, "seeded-workspace");
	await waitFor(() =>
		expect(
			pending.store.getState().tabs[0]?.panes[pending.paneId]?.data,
		).toMatchObject({ sessionId: "seeded" }),
	);
	expect(
		clients[0]?.getQueryData([
			"acp-chat-session",
			"seeded",
			hostUrl,
			connectionStatus,
		]),
	).toEqual({ live: true, session: null, cursor: null });
});
