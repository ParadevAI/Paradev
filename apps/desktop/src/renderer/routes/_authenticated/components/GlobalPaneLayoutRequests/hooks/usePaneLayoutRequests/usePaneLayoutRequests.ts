import type { WorkspaceState } from "@superset/panes";
import {
	PANE_AREAS,
	type PaneArea,
	type PaneLayoutOp,
	type PaneLayoutOpResult,
} from "@superset/shared/pane-layout-ops";
import { useEffect } from "react";
import { markTerminalForBackground } from "renderer/lib/terminal/terminal-background-intents";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { useRightPaneFullScreen } from "renderer/stores/right-pane-full-screen";
import {
	getV2PaneLayoutStore,
	type PaneLayoutSlot,
} from "renderer/stores/v2-pane-layout-stores";
import {
	applyRememberedV2PaneSelection,
	rememberV2PaneSelection,
} from "renderer/stores/v2-pane-selection";
import {
	applyPaneLayoutOp,
	type PaneAreas,
	PaneLayoutOpError,
} from "./utils/applyPaneLayoutOp";
import { describePaneLayout } from "./utils/describePaneLayout";

type LayoutState = WorkspaceState<PaneViewerData>;

const EMPTY_LAYOUT: LayoutState = {
	version: 1,
	tabs: [],
	activeTabId: null,
};

const SLOTS: Record<PaneArea, PaneLayoutSlot> = {
	main: "paneLayout",
	sidebar: "rightPaneLayout",
};

const selectionKey = (workspaceId: string, area: PaneArea) =>
	area === "main" ? workspaceId : `${workspaceId}:${SLOTS[area]}`;

/** Keeps a terminal closed with `keepTerminal` from being re-adopted into a new tab. */
function backgroundClosedTerminal(
	areas: PaneAreas,
	workspaceId: string,
	op: PaneLayoutOp,
): void {
	if (op.type !== "close" || !op.keepTerminal) return;
	for (const tab of [...areas.main.tabs, ...areas.sidebar.tabs]) {
		const pane = tab.panes[op.paneId];
		if (pane?.kind === "terminal") {
			const { terminalId } = pane.data as { terminalId: string };
			markTerminalForBackground(terminalId, workspaceId);
			return;
		}
	}
}

function readArea(
	row: { paneLayout?: unknown; rightPaneLayout?: unknown } | undefined,
	workspaceId: string,
	area: PaneArea,
): LayoutState {
	const mounted = getV2PaneLayoutStore(workspaceId, SLOTS[area]);
	if (mounted) {
		const { tabs, activeTabId } = mounted.getState();
		return { version: 1, tabs, activeTabId };
	}
	return applyRememberedV2PaneSelection(
		selectionKey(workspaceId, area),
		(row?.[SLOTS[area]] as LayoutState | undefined) ?? EMPTY_LAYOUT,
	);
}

function setSidebarView(
	collections: Pick<AppCollections, "v2WorkspaceLocalState">,
	workspaceId: string,
	wasOpen: boolean,
	view: { open: boolean; fullScreen?: boolean },
): void {
	const { fullScreen, setFullScreen, clearFor } =
		useRightPaneFullScreen.getState();
	const current = fullScreen?.workspaceId === workspaceId ? fullScreen : null;
	if (view.open && view.fullScreen) {
		if (!current) setFullScreen({ workspaceId, closeOnExit: !wasOpen });
	} else {
		clearFor(workspaceId);
	}
	if (view.open !== wasOpen) {
		collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
			draft.rightSidebarOpen = view.open;
		});
	}
}

function runPaneLayoutOp(
	collections: Pick<AppCollections, "v2WorkspaceLocalState">,
	workspaceId: string,
	op: PaneLayoutOp,
): PaneLayoutOpResult {
	const row = collections.v2WorkspaceLocalState.get(workspaceId);
	const isMounted = getV2PaneLayoutStore(workspaceId, "paneLayout") != null;
	if (!row && op.type !== "list" && (!isMounted || op.type === "sidebar")) {
		throw new PaneLayoutOpError(
			"PRECONDITION_FAILED",
			"This workspace has no pane layout in the desktop app yet. Open it there once, then retry.",
		);
	}
	const previous: PaneAreas = {
		main: readArea(row, workspaceId, "main"),
		sidebar: readArea(row, workspaceId, "sidebar"),
	};
	const outcome = applyPaneLayoutOp(previous, op);
	backgroundClosedTerminal(previous, workspaceId, op);

	if (op.type !== "list") {
		for (const area of PANE_AREAS) {
			const next = outcome.areas[area];
			if (next === previous[area]) continue;
			const mounted = getV2PaneLayoutStore(workspaceId, SLOTS[area]);
			if (mounted) {
				mounted.getState().replaceState(next);
				continue;
			}
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft[SLOTS[area]] = next;
			});
			rememberV2PaneSelection(selectionKey(workspaceId, area), next);
		}
	}

	const wasOpen = row?.rightSidebarOpen ?? false;
	if (op.type === "sidebar") {
		setSidebarView(collections, workspaceId, wasOpen, op);
	} else if (outcome.showSidebar && !wasOpen && row) {
		setSidebarView(collections, workspaceId, wasOpen, { open: true });
	}
	const open =
		collections.v2WorkspaceLocalState.get(workspaceId)?.rightSidebarOpen ??
		false;
	const fullScreen =
		open &&
		useRightPaneFullScreen.getState().fullScreen?.workspaceId === workspaceId;

	const main = describePaneLayout(outcome.areas.main);
	return {
		paneId: outcome.paneId,
		tabId: outcome.tabId,
		layout: {
			...main,
			sidebar: {
				open,
				fullScreen,
				...describePaneLayout(outcome.areas.sidebar),
			},
		},
	};
}

/** Applies pane layout ops sent by the CLI and replies with the result. */
export function usePaneLayoutRequests() {
	const collections = useCollections();

	useEffect(() => {
		const subscription = electronTrpcClient.paneLayout.onRequest.subscribe(
			undefined,
			{
				onData: ({ requestId, workspaceId, op }) => {
					let reply: Parameters<
						typeof electronTrpcClient.paneLayout.respond.mutate
					>[0];
					try {
						const { paneId, tabId, layout } = runPaneLayoutOp(
							collections,
							workspaceId,
							op,
						);
						reply = { requestId, result: { paneId, tabId, layout } };
					} catch (error) {
						reply = {
							requestId,
							error: {
								code:
									error instanceof PaneLayoutOpError ? error.code : undefined,
								message: error instanceof Error ? error.message : String(error),
							},
						};
					}
					electronTrpcClient.paneLayout.respond.mutate(reply).catch((err) => {
						console.error("[usePaneLayoutRequests] reply failed:", err);
					});
				},
			},
		);
		return () => {
			subscription.unsubscribe();
		};
	}, [collections]);
}
