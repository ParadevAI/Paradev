import "../globals.css";
import { emptySnapshot, snapshotFromOutline } from "@superset/chat/core";
import type { SessionSnapshot } from "@superset/chat/core";
import { useApprovals, useChatSession, useTimeline } from "@superset/chat/react";
import { MessageScroller } from "@superset/chat-ui/MessageScroller";
import { I18nProvider } from "@superset/i18n/react";
import { workspaceTrpc } from "@superset/workspace-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { Profiler, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { useStableList } from "renderer/hooks/useStableList";
import { HostWorkspacesContext } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider/HostWorkspacesProvider";
import { LocalHostServiceContext } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import { SandboxAccessContext } from "renderer/routes/_authenticated/providers/SandboxAccessProvider/SandboxAccessProvider";
import { ChatPaneActionsProvider } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/providers/ChatPaneActionsProvider";
import { TurnFailureActionsProvider } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/providers/TurnFailureActionsProvider";
import { Transcript } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/components/Transcript";
import { useChildrenByParent } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/components/Transcript/hooks/useChildrenByParent";
import { NestedItemsProvider } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/components/Transcript/providers/NestedItemsProvider";
import { TranscriptPluginsProvider } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/components/Transcript/providers/TranscriptPluginsProvider";
import { editableMessageIds } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/utils/messageEdit";
import { promptHistory } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/utils/promptHistory";
import { railMessages } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/utils/railMessages";
import { SessionModeProvider, withStoredHistory } from "./compat";
import { buildFixture, createBenchClient } from "./fixture";

const params = new URLSearchParams(location.search);
const turnCount = Number(params.get("turns") ?? 250);
const mode = params.get("mode") ?? "local";
const fix = params.get("fix") === "1";
const verify = params.get("verify") === "1";

const fixture = buildFixture(turnCount);
const { client, start } = createBenchClient(fixture);
const storedSnapshot: SessionSnapshot | null =
	mode === "cloud"
		? snapshotFromOutline({
				session: fixture.session,
				turns: fixture.turns,
				items: fixture.items,
				cursor: fixture.cursor,
			} as Parameters<typeof snapshotFromOutline>[0])
		: null;

type Stats = {
	recording: boolean;
	commits: number;
	renderMs: number[];
	updates: number;
	longTasks: number[];
	loafs: { duration: number; blocking: number }[];
	frameGaps: number[];
	ready: boolean;
	rows: number;
	items: number;
};

const stats: Stats = {
	recording: false,
	commits: 0,
	renderMs: [],
	updates: 0,
	longTasks: [],
	loafs: [],
	frameGaps: [],
	ready: false,
	rows: 0,
	items: 0,
};

new PerformanceObserver((list) => {
	if (!stats.recording) return;
	for (const entry of list.getEntries()) stats.longTasks.push(entry.duration);
}).observe({ type: "longtask" });
try {
	new PerformanceObserver((list) => {
		if (!stats.recording) return;
		for (const entry of list.getEntries())
			stats.loafs.push({
				duration: entry.duration,
				blocking: (entry as unknown as { blockingDuration: number })
					.blockingDuration,
			});
	}).observe({ type: "long-animation-frame" });
} catch {}

let lastFrame = 0;
const tick = (now: number) => {
	if (stats.recording && lastFrame) stats.frameGaps.push(now - lastFrame);
	lastFrame = now;
	requestAnimationFrame(tick);
};
requestAnimationFrame(tick);

/** The proposed fix, as it would land in SessionView/hooks/useStoredHistory. */
function useStoredHistory(
	stored: SessionSnapshot | null | undefined,
	live: SessionSnapshot,
): SessionSnapshot {
	const { items, turns, cursor, session } = live;
	const merged = useMemo(
		() =>
			stored && withStoredHistory
				? withStoredHistory(stored, {
						...emptySnapshot(),
						items,
						turns,
						cursor,
						session,
					})
				: null,
		[stored, items, turns, cursor, session],
	);
	return useMemo(() => {
		if (!merged || merged.items === items) return live;
		return {
			...merged,
			liveStreams: live.liveStreams,
			pendingReset: live.pendingReset,
		};
	}, [merged, items, live]);
}

function sameEntries<V>(a: ReadonlyMap<string, V>, b: ReadonlyMap<string, V>) {
	if (a.size !== b.size) return false;
	const bKeys = [...b.keys()];
	let index = 0;
	for (const [key, value] of a) {
		if (bKeys[index++] !== key || b.get(key) !== value) return false;
	}
	return true;
}

let mismatches = 0;
let checks = 0;
Object.assign(window, { __verify: () => ({ checks, mismatches }) });

const noop = () => {};

function BenchSession() {
	const session = useChatSession({ client, sendEnabled: true });
	const original = useMemo(
		() =>
			fix && !verify
				? null
				: storedSnapshot && withStoredHistory
					? withStoredHistory(storedSnapshot, session.snapshot)
					: session.snapshot,
		[session.snapshot],
	);
	const fixed = useStoredHistory(fix ? storedSnapshot : null, session.snapshot);
	const shownSnapshot = fix ? fixed : (original as SessionSnapshot);
	if (verify && original) {
		checks += 1;
		const same =
			sameEntries(original.items, fixed.items) &&
			sameEntries(original.turns, fixed.turns) &&
			sameEntries(original.liveStreams, fixed.liveStreams) &&
			original.session === fixed.session;
		if (!same) mismatches += 1;
	}
	const timeline = useTimeline(shownSnapshot, { nestChildItems: true });
	const harness = session.snapshot.session?.harness;
	const rail = useStableList(
		useMemo(() => railMessages(timeline), [timeline]),
		(a, b) => a.id === b.id && a.role === b.role && a.preview === b.preview,
	);
	const history = useStableList(
		useMemo(() => promptHistory(timeline, harness), [timeline, harness]),
	);
	const editableIds = useMemo(
		() => editableMessageIds(timeline, harness),
		[timeline, harness],
	);
	const approvals = useApprovals(session.snapshot);
	const childrenByParent = useChildrenByParent(shownSnapshot);
	const onRespond = useCallback(() => {}, []);
	const nestedItems = useMemo(
		() => ({
			snapshot: shownSnapshot,
			childrenByParent,
			requestItemBodies: session.requestItemBodies,
			respondToApproval: onRespond,
			openSubagent: noop,
			moveToBackground: noop,
		}),
		[shownSnapshot, childrenByParent, session.requestItemBodies, onRespond],
	);
	const loadOlder = useCallback(async () => true, []);
	stats.items = shownSnapshot.items.size;
	stats.rows = timeline.length + rail.length * 0 + history.length * 0;
	if (session.status === "ready" && shownSnapshot.items.size > 0) stats.ready = true;

	return (
		<ChatPaneActionsProvider editableMessageIds={editableIds} workspaceId="bench">
			<MessageScroller.Provider
				autoScroll
				defaultScrollPosition="end"
				scrollEdgeThreshold={24}
				scrollPreviousItemPeek={0}
			>
				<div className="@container relative flex min-h-0 flex-1">
					<SessionModeProvider value={session.snapshot.session?.modeId}>
						<TranscriptPluginsProvider value={[]}>
							<NestedItemsProvider value={nestedItems}>
								<TurnFailureActionsProvider value={undefined as never}>
									<Transcript
										approvals={approvals}
										groups={timeline}
										hasOlder={session.hasOlder}
										isActive
										onDiscardPrompt={session.discardPrompt}
										onLoadOlder={loadOlder}
										onRequestItemBodies={session.requestItemBodies}
										onRespond={onRespond}
										onRetryPrompt={session.retryPrompt}
										outbox={session.outbox}
										sessionId={client.sessionId}
										snapshot={shownSnapshot}
									/>
								</TurnFailureActionsProvider>
							</NestedItemsProvider>
						</TranscriptPluginsProvider>
					</SessionModeProvider>
				</div>
			</MessageScroller.Provider>
		</ChatPaneActionsProvider>
	);
}

const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false, enabled: false } },
});
queryClient.setQueryData(["relay-endpoint"], { url: "ws://127.0.0.1:9" });

const workspaceClient = workspaceTrpc.createClient({
	links: [httpBatchLink({ url: "http://127.0.0.1:9/trpc" })],
});

const localHost = {
	machineId: "bench-machine",
	activeHostUrl: null,
	activeOrganizationId: null,
	activeOrganizationName: null,
	hostServiceStatus: "unknown",
	waitForHostReady: async () => null,
} as never;
const hostWorkspaces = { workspaces: [], isReady: true } as never;
const sandboxAccess = {
	targets: [],
	isReady: true,
	agentCredentialsChangedWorkspaceId: null,
	usageRefusal: null,
} as never;

function onRender(_id: string, _phase: string, actualDuration: number) {
	if (!stats.recording) return;
	stats.commits += 1;
	stats.renderMs.push(actualDuration);
}

createRoot(document.getElementById("root") as HTMLElement).render(
	<QueryClientProvider client={queryClient}>
		<workspaceTrpc.Provider client={workspaceClient} queryClient={queryClient}>
		<I18nProvider locale="en">
			<LocalHostServiceContext.Provider value={localHost}>
				<HostWorkspacesContext.Provider value={hostWorkspaces}>
					<SandboxAccessContext.Provider value={sandboxAccess}>
						<Profiler id="chat" onRender={onRender}>
							<div className="dark flex h-screen w-full flex-col bg-background text-foreground">
								<BenchSession />
							</div>
						</Profiler>
					</SandboxAccessContext.Provider>
				</HostWorkspacesContext.Provider>
			</LocalHostServiceContext.Provider>
		</I18nProvider>
		</workspaceTrpc.Provider>
	</QueryClientProvider>,
);

Object.assign(window, {
	__bench: {
		stats,
		run: async (updates: number, intervalMs: number) => {
			stats.recording = true;
			await start({ updates, intervalMs }, () => {
				stats.updates += 1;
			});
			await new Promise((resolve) => setTimeout(resolve, 500));
			stats.recording = false;
			return stats;
		},
	},
});
