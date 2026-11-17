import { createStore, type StoreApi } from "zustand/vanilla";
import type {
	LayoutNode,
	Pane,
	SplitPath,
	SplitPosition,
	Tab,
	WorkspaceState,
} from "../../types";
import {
	equalizeAllSplits,
	equalizeSplitBoundary,
	findFirstPaneId,
	findPaneInLayout,
	generateId,
	getActiveIdAfterRemoval,
	getPaneIdsInLayout,
	graftSubtreeAtPane,
	positionToDirection,
	removePaneFromLayout,
	replacePaneIdInLayout,
	splitPaneInLayout,
	updateAtPath,
} from "./utils";

function buildPane<TData>(args: CreatePaneInput<TData>): Pane<TData> {
	return {
		id: args.id ?? generateId("pane"),
		kind: args.kind,
		titleOverride: args.titleOverride,
		pinned: args.pinned,
		data: args.data,
	};
}

function buildBalancedTree(
	panes: LayoutNode[],
	direction: "horizontal" | "vertical" = "vertical",
): LayoutNode {
	if (panes.length === 1) {
		const [single] = panes as [LayoutNode];
		return single;
	}

	const mid = Math.ceil(panes.length / 2);
	const nextDirection = direction === "vertical" ? "horizontal" : "vertical";

	return {
		type: "split",
		direction,
		first: buildBalancedTree(panes.slice(0, mid), nextDirection),
		second: buildBalancedTree(panes.slice(mid), nextDirection),
	};
}

function buildTab<TData>(args: {
	id?: string;
	titleOverride?: string;
	panes: [Pane<TData>, ...Pane<TData>[]];
	activePaneId?: string;
}): Tab<TData> {
	const panesMap: Record<string, Pane<TData>> = {};
	const leaves: LayoutNode[] = [];

	for (const pane of args.panes) {
		panesMap[pane.id] = pane;
		leaves.push({ type: "pane", paneId: pane.id });
	}

	return {
		id: args.id ?? generateId("tab"),
		titleOverride: args.titleOverride,
		createdAt: Date.now(),
		activePaneId: args.activePaneId ?? args.panes[0].id,
		layout: buildBalancedTree(leaves),
		panes: panesMap,
	};
}

function getActivePaneIdAfterRemoval(
	originalLayout: LayoutNode,
	nextLayout: LayoutNode,
	activePaneId: string | null | undefined,
	removedPaneId: string,
): string | null {
	return (
		getActiveIdAfterRemoval(
			getPaneIdsInLayout(originalLayout),
			activePaneId,
			removedPaneId,
		) ?? findFirstPaneId(nextLayout)
	);
}

// --- Public types ---

export type CreatePaneInput<TData> = {
	id?: string;
	kind: string;
	titleOverride?: string;
	pinned?: boolean;
	data: TData;
};

export type PaneOpenOptions = {
	/** Give the opened (or reused) pane keyboard focus. Defaults to true. */
	focus?: boolean;
	/** Focus an open pane with the same key instead of creating one. Defaults to true. */
	reuse?: boolean;
	/** When an open pane is reused, give it the new pane's data. */
	replaceData?: boolean;
};

export type CreateTabInput<TData> = PaneOpenOptions & {
	id?: string;
	titleOverride?: string;
	panes: [CreatePaneInput<TData>, ...CreatePaneInput<TData>[]];
	activePaneId?: string;
};

export type OpenPaneArgs<TData> = PaneOpenOptions & {
	pane: CreatePaneInput<TData>;
	beside?: string;
};

export type GetPaneKey<TData> = (
	pane: Pick<Pane<TData>, "kind" | "data">,
) => string | undefined;

export type FocusRequest = { paneId: string; seq: number };

export type PlacePane<TData> = (
	store: WorkspaceStore<TData>,
	args: OpenPaneArgs<TData>,
) => void;

export interface WorkspaceStore<TData> extends WorkspaceState<TData> {
	/** One-shot request for a pane to take keyboard focus. Never persisted. */
	focusRequest: FocusRequest | null;
	focusPane: (paneId: string) => void;
	clearFocusRequest: (seq: number) => void;
	findPaneByKey: (key: string) => { tabId: string; pane: Pane<TData> } | null;

	addTab: (args: CreateTabInput<TData>) => void;
	removeTab: (tabId: string, options?: { intent?: "close" | "remove" }) => void;
	insertTab: (args: { tab: Tab<TData>; index?: number }) => void;
	setActiveTab: (tabId: string) => void;
	setTabTitleOverride: (args: {
		tabId: string;
		titleOverride?: string;
	}) => void;
	getTab: (tabId: string) => Tab<TData> | null;
	getActiveTab: () => Tab<TData> | null;

	setActivePane: (args: { tabId: string; paneId: string }) => void;
	getPane: (paneId: string) => { tabId: string; pane: Pane<TData> } | null;
	getActivePane: (
		tabId?: string,
	) => { tabId: string; pane: Pane<TData> } | null;
	closePane: (args: {
		tabId: string;
		paneId: string;
		intent?: "close" | "remove";
	}) => void;
	subscribePaneClose: (
		listener: (panes: readonly Pane<TData>[]) => void,
	) => () => void;
	setPaneData: (args: { paneId: string; data: TData }) => void;
	setPaneTitleOverride: (args: {
		tabId: string;
		paneId: string;
		titleOverride?: string;
	}) => void;
	setPanePinned: (args: { paneId: string; pinned: boolean }) => void;
	replacePane: (args: {
		tabId: string;
		paneId: string;
		newPane: CreatePaneInput<TData>;
	}) => void;

	openPane: (args: OpenPaneArgs<TData>) => void;

	splitPane: (args: {
		tabId: string;
		paneId: string;
		position: SplitPosition;
		newPane: CreatePaneInput<TData>;
		selectNewPane?: boolean;
		focus?: boolean;
	}) => void;
	addPane: (args: {
		tabId: string;
		pane: CreatePaneInput<TData>;
		position?: SplitPosition;
		relativeToPaneId?: string;
		focus?: boolean;
	}) => void;
	resizeSplit: (args: {
		tabId: string;
		path: SplitPath;
		splitPercentage: number;
	}) => void;
	equalizeSplit: (args: { tabId: string; path: SplitPath }) => void;
	equalizeTab: (args: { tabId: string }) => void;

	movePaneToSplit: (args: {
		sourcePaneId: string;
		targetPaneId: string;
		position: SplitPosition;
	}) => void;

	movePaneToTab: (args: { paneId: string; targetTabId: string }) => void;
	movePaneToNewTab: (args: { paneId: string; toIndex?: number }) => void;
	moveTabToSplit: (args: {
		sourceTabId: string;
		targetPaneId: string;
		position: SplitPosition;
	}) => void;

	reorderTab: (args: { tabId: string; toIndex: number }) => void;

	replaceState: (
		next:
			| WorkspaceState<TData>
			| ((prev: WorkspaceState<TData>) => WorkspaceState<TData>),
	) => void;
}

export interface CreateWorkspaceStoreOptions<TData> {
	initialState?: WorkspaceState<TData>;
	placePane?: PlacePane<TData>;
	/** Panes with the same key show the same thing; opening one again focuses it. */
	getPaneKey?: GetPaneKey<TData>;
}

function reuseOpenPane<TData>(
	get: () => WorkspaceStore<TData>,
	getPaneKey: GetPaneKey<TData> | undefined,
	pane: CreatePaneInput<TData>,
	options: PaneOpenOptions,
): boolean {
	if (options.reuse === false || !getPaneKey) return false;
	const key = getPaneKey(pane);
	const open = key ? get().findPaneByKey(key) : null;
	if (!open) return false;
	if (options.replaceData) {
		get().setPaneData({ paneId: open.pane.id, data: pane.data });
	}
	if (options.focus === false) {
		get().setActivePane({ tabId: open.tabId, paneId: open.pane.id });
	} else {
		get().focusPane(open.pane.id);
	}
	return true;
}

function placeNewPane<TData>(
	get: () => WorkspaceStore<TData>,
	placePane: PlacePane<TData> | undefined,
	args: OpenPaneArgs<TData>,
): void {
	const s = get();
	if (placePane) {
		placePane(s, args);
		return;
	}
	const anchor = args.beside ? s.getPane(args.beside) : null;
	const besideTab = anchor ? s.getTab(anchor.tabId) : null;
	if (anchor && besideTab) {
		const reusable = Object.values(besideTab.panes).find(
			(p) => p.kind === args.pane.kind && !p.pinned && p.id !== anchor.pane.id,
		);
		if (reusable) {
			s.setPaneData({ paneId: reusable.id, data: args.pane.data });
			s.setActivePane({ tabId: besideTab.id, paneId: reusable.id });
			return;
		}
		s.splitPane({
			tabId: besideTab.id,
			paneId: anchor.pane.id,
			position: "left",
			newPane: args.pane,
			focus: false,
		});
		return;
	}
	const activeTabId = s.activeTabId;
	const tab = activeTabId ? s.tabs.find((t) => t.id === activeTabId) : null;

	// No tab → create one
	if (!tab || !activeTabId) {
		get().addTab({ panes: [args.pane], focus: false, reuse: false });
		return;
	}

	// Find unpinned pane of same kind → replace
	const unpinned = Object.values(tab.panes).find(
		(p) => p.kind === args.pane.kind && !p.pinned,
	);
	if (unpinned) {
		get().replacePane({
			tabId: activeTabId,
			paneId: unpinned.id,
			newPane: args.pane,
		});
		return;
	}

	// Split the active pane right
	const activePane = tab.activePaneId;
	if (activePane && tab.layout && findPaneInLayout(tab.layout, activePane)) {
		get().splitPane({
			tabId: activeTabId,
			paneId: activePane,
			position: "right",
			newPane: args.pane,
			focus: false,
		});
		return;
	}

	// Fallback: add to tab
	get().addPane({
		tabId: activeTabId,
		pane: args.pane,
		focus: false,
	});
}

export function createWorkspaceStore<TData>(
	options?: CreateWorkspaceStoreOptions<TData>,
): StoreApi<WorkspaceStore<TData>> {
	const closeListeners = new Set<(panes: readonly Pane<TData>[]) => void>();
	const notifyClosed = (panes: readonly Pane<TData>[]) => {
		if (panes.length === 0) return;
		for (const listener of closeListeners) {
			try {
				listener(panes);
			} catch (error) {
				console.error("Pane close listener failed", error);
			}
		}
	};
	const placePane = options?.placePane;
	const getPaneKey = options?.getPaneKey;
	let focusSeq = 0;
	const requestFocus = (paneId: string): FocusRequest => ({
		paneId,
		seq: ++focusSeq,
	});
	return createStore<WorkspaceStore<TData>>((set, get) => ({
		version: 1,
		tabs: options?.initialState?.tabs ?? [],
		activeTabId: options?.initialState?.activeTabId ?? null,
		focusRequest: null,

		focusPane: (paneId) => {
			set((s) => {
				const tab = s.tabs.find((t) => t.panes[paneId]);
				if (!tab) return s;
				return {
					activeTabId: tab.id,
					tabs:
						tab.activePaneId === paneId
							? s.tabs
							: s.tabs.map((t) =>
									t.id === tab.id ? { ...t, activePaneId: paneId } : t,
								),
					focusRequest: requestFocus(paneId),
				};
			});
		},

		clearFocusRequest: (seq) => {
			set((s) => (s.focusRequest?.seq === seq ? { focusRequest: null } : s));
		},

		findPaneByKey: (key) => {
			if (!getPaneKey) return null;
			for (const tab of get().tabs) {
				for (const pane of Object.values(tab.panes)) {
					if (getPaneKey(pane) === key) return { tabId: tab.id, pane };
				}
			}
			return null;
		},

		subscribePaneClose: (listener) => {
			closeListeners.add(listener);
			return () => {
				closeListeners.delete(listener);
			};
		},

		addTab: (args) => {
			if (
				args.panes.length === 1 &&
				reuseOpenPane(get, getPaneKey, args.panes[0], args)
			) {
				return;
			}
			const builtPanes = args.panes.map(buildPane) as [
				Pane<TData>,
				...Pane<TData>[],
			];
			const tab = buildTab({ ...args, panes: builtPanes });
			set((s) => ({
				tabs: [...s.tabs, tab],
				activeTabId: tab.id,
				...(args.focus !== false && tab.activePaneId
					? { focusRequest: requestFocus(tab.activePaneId) }
					: {}),
			}));
		},

		removeTab: (tabId, options) => {
			const tab = get().getTab(tabId);
			if (!tab) return;
			set((s) => {
				const nextTabs = s.tabs.filter((t) => t.id !== tabId);
				return {
					tabs: nextTabs,
					activeTabId: getActiveIdAfterRemoval(
						s.tabs.map((tab) => tab.id),
						s.activeTabId,
						tabId,
					),
				};
			});
			if (options?.intent !== "remove") notifyClosed(Object.values(tab.panes));
		},

		insertTab: (args) => {
			set((s) => {
				if (s.tabs.some((t) => t.id === args.tab.id)) return s;
				const nextTabs = [...s.tabs];
				const index = Math.max(
					0,
					Math.min(args.index ?? nextTabs.length, nextTabs.length),
				);
				nextTabs.splice(index, 0, args.tab);
				return { tabs: nextTabs, activeTabId: args.tab.id };
			});
		},

		setActiveTab: (tabId) => {
			set((s) => {
				const tab = s.tabs.find((t) => t.id === tabId);
				if (!tab) return s;
				const keepsFocusRequest =
					!s.focusRequest || Boolean(tab.panes[s.focusRequest.paneId]);
				return {
					activeTabId: tabId,
					...(keepsFocusRequest ? {} : { focusRequest: null }),
				};
			});
		},

		setTabTitleOverride: (args) => {
			set((s) => ({
				tabs: s.tabs.map((t) =>
					t.id === args.tabId ? { ...t, titleOverride: args.titleOverride } : t,
				),
			}));
		},

		getTab: (tabId) => get().tabs.find((t) => t.id === tabId) ?? null,

		getActiveTab: () => {
			const s = get();
			return s.tabs.find((t) => t.id === s.activeTabId) ?? null;
		},

		setActivePane: (args) => {
			set((s) => {
				const tab = s.tabs.find((t) => t.id === args.tabId);
				if (!tab || !tab.panes[args.paneId]) return s;

				return {
					activeTabId: args.tabId,
					tabs: s.tabs.map((t) =>
						t.id === args.tabId ? { ...t, activePaneId: args.paneId } : t,
					),
				};
			});
		},

		getPane: (paneId) => {
			for (const tab of get().tabs) {
				const pane = tab.panes[paneId];
				if (pane) return { tabId: tab.id, pane };
			}
			return null;
		},

		getActivePane: (tabId) => {
			const s = get();
			const tab = tabId
				? s.tabs.find((t) => t.id === tabId)
				: s.tabs.find((t) => t.id === s.activeTabId);
			if (!tab || !tab.activePaneId) return null;

			const pane = tab.panes[tab.activePaneId];
			if (!pane) return null;

			return { tabId: tab.id, pane };
		},

		closePane: (args) => {
			const pane = get().getTab(args.tabId)?.panes[args.paneId];
			set((s) => {
				const tab = s.tabs.find((t) => t.id === args.tabId);
				if (!tab || !tab.panes[args.paneId] || !tab.layout) return s;

				const nextLayout = removePaneFromLayout(tab.layout, args.paneId);
				const { [args.paneId]: _, ...nextPanes } = tab.panes;

				if (!nextLayout) {
					const nextTabs = s.tabs.filter((t) => t.id !== args.tabId);
					return {
						tabs: nextTabs,
						activeTabId: getActiveIdAfterRemoval(
							s.tabs.map((candidate) => candidate.id),
							s.activeTabId,
							args.tabId,
						),
					};
				}

				return {
					tabs: s.tabs.map((t) =>
						t.id === args.tabId
							? {
									...tab,
									layout: nextLayout,
									panes: nextPanes,
									activePaneId: getActivePaneIdAfterRemoval(
										tab.layout,
										nextLayout,
										tab.activePaneId,
										args.paneId,
									),
								}
							: t,
					),
				};
			});
			if (pane && !get().getPane(pane.id) && args.intent !== "remove")
				notifyClosed([pane]);
		},

		setPaneData: (args) => {
			set((s) => {
				const location = get().getPane(args.paneId);
				if (!location) return s;

				return {
					tabs: s.tabs.map((t) =>
						t.id === location.tabId
							? {
									...t,
									panes: {
										...t.panes,
										[args.paneId]: {
											...location.pane,
											data: args.data,
										},
									},
								}
							: t,
					),
				};
			});
		},

		setPaneTitleOverride: (args) => {
			set((s) => {
				const tab = s.tabs.find((t) => t.id === args.tabId);
				const pane = tab?.panes[args.paneId];
				if (!tab || !pane) return s;

				return {
					tabs: s.tabs.map((t) =>
						t.id === args.tabId
							? {
									...t,
									panes: {
										...t.panes,
										[args.paneId]: {
											...pane,
											titleOverride: args.titleOverride,
										},
									},
								}
							: t,
					),
				};
			});
		},

		setPanePinned: (args) => {
			set((s) => {
				for (const tab of s.tabs) {
					const pane = tab.panes[args.paneId];
					if (pane) {
						return {
							tabs: s.tabs.map((t) =>
								t.id === tab.id
									? {
											...t,
											panes: {
												...t.panes,
												[args.paneId]: { ...pane, pinned: args.pinned },
											},
										}
									: t,
							),
						};
					}
				}
				return s;
			});
		},

		replacePane: (args) => {
			const replaced = get().getTab(args.tabId)?.panes[args.paneId];
			set((s) => {
				const tab = s.tabs.find((t) => t.id === args.tabId);
				const pane = tab?.panes[args.paneId];
				if (!tab || !pane || !tab.layout) return s;
				if (pane.pinned) return s;

				const { layout } = tab;
				const newPane = buildPane(args.newPane);
				const { [args.paneId]: _, ...restPanes } = tab.panes;

				return {
					tabs: s.tabs.map((t) =>
						t.id === args.tabId
							? {
									...tab,
									layout: replacePaneIdInLayout(
										layout,
										args.paneId,
										newPane.id,
									),
									panes: { ...restPanes, [newPane.id]: newPane },
									activePaneId: newPane.id,
								}
							: t,
					),
				};
			});
			if (replaced && !get().getPane(replaced.id)) notifyClosed([replaced]);
		},

		openPane: (args) => {
			if (reuseOpenPane(get, getPaneKey, args.pane, args)) return;
			const pane = { ...args.pane, id: args.pane.id ?? generateId("pane") };
			placeNewPane(get, placePane, {
				...args,
				pane,
				focus: false,
				reuse: false,
			});
			if (args.focus === false) return;
			// A beside-pane reuse keeps the old pane's id; it is then the active one.
			const placedId =
				get().getPane(pane.id)?.pane.id ?? get().getActivePane()?.pane.id;
			if (placedId) get().focusPane(placedId);
		},

		splitPane: (args) => {
			set((s) => {
				const tab = s.tabs.find((t) => t.id === args.tabId);
				if (!tab || !tab.layout) return s;
				if (
					!tab.panes[args.paneId] ||
					!findPaneInLayout(tab.layout, args.paneId)
				)
					return s;

				const { layout } = tab;
				const newPane = buildPane(args.newPane);
				const selectNewPane = args.selectNewPane !== false;

				return {
					tabs: s.tabs.map((t) =>
						t.id === args.tabId
							? {
									...tab,
									layout: splitPaneInLayout(
										layout,
										args.paneId,
										newPane.id,
										args.position,
									),
									panes: {
										...tab.panes,
										[newPane.id]: newPane,
									},
									activePaneId: selectNewPane ? newPane.id : tab.activePaneId,
								}
							: t,
					),
					...(selectNewPane && args.focus !== false
						? { focusRequest: requestFocus(newPane.id) }
						: {}),
				};
			});
		},

		addPane: (args) => {
			const newPane = buildPane(args.pane);
			set((s) => {
				const tab = s.tabs.find((t) => t.id === args.tabId);
				if (!tab) return s;

				if (!tab.layout) {
					return {
						tabs: s.tabs.map((t) =>
							t.id === args.tabId
								? {
										...tab,
										layout: {
											type: "pane",
											paneId: newPane.id,
										} satisfies LayoutNode,
										panes: {
											...tab.panes,
											[newPane.id]: newPane,
										},
										activePaneId: newPane.id,
									}
								: t,
						),
					};
				}

				const position = args.position ?? "right";
				const targetPaneId = args.relativeToPaneId ?? tab.activePaneId;

				const { layout } = tab;

				if (targetPaneId && findPaneInLayout(layout, targetPaneId)) {
					return {
						tabs: s.tabs.map((t) =>
							t.id === args.tabId
								? {
										...tab,
										layout: splitPaneInLayout(
											layout,
											targetPaneId,
											newPane.id,
											position,
										),
										panes: {
											...tab.panes,
											[newPane.id]: newPane,
										},
										activePaneId: newPane.id,
									}
								: t,
						),
					};
				}

				const direction = positionToDirection(position);
				const newPaneLeaf: LayoutNode = {
					type: "pane",
					paneId: newPane.id,
				};
				const isFirst = position === "left" || position === "top";
				const edgeLayout: LayoutNode = {
					type: "split",
					direction,
					first: isFirst ? newPaneLeaf : layout,
					second: isFirst ? layout : newPaneLeaf,
				};

				return {
					tabs: s.tabs.map((t) =>
						t.id === args.tabId
							? {
									...tab,
									layout: edgeLayout,
									panes: {
										...tab.panes,
										[newPane.id]: newPane,
									},
									activePaneId: newPane.id,
								}
							: t,
					),
				};
			});
			if (args.focus !== false && get().getPane(newPane.id)) {
				set({ focusRequest: requestFocus(newPane.id) });
			}
		},

		resizeSplit: (args) => {
			set((s) => {
				const tab = s.tabs.find((t) => t.id === args.tabId);
				if (!tab || !tab.layout) return s;

				return {
					tabs: s.tabs.map((t) =>
						t.id === args.tabId
							? {
									...t,
									layout: updateAtPath(tab.layout, args.path, (node) =>
										node.type === "split"
											? {
													...node,
													splitPercentage: args.splitPercentage,
												}
											: node,
									),
								}
							: t,
					),
				};
			});
		},

		equalizeSplit: (args) => {
			set((s) => {
				const tab = s.tabs.find((t) => t.id === args.tabId);
				if (!tab || !tab.layout) return s;

				return {
					tabs: s.tabs.map((t) =>
						t.id === args.tabId
							? {
									...t,
									layout: equalizeSplitBoundary(tab.layout, args.path),
								}
							: t,
					),
				};
			});
		},

		equalizeTab: (args) => {
			set((s) => {
				const tab = s.tabs.find((t) => t.id === args.tabId);
				if (!tab?.layout) return s;

				return {
					tabs: s.tabs.map((t) =>
						t.id === args.tabId
							? { ...t, layout: equalizeAllSplits(tab.layout) }
							: t,
					),
				};
			});
		},

		movePaneToSplit: (args) => {
			set((s) => {
				let sourceTab: Tab<TData> | undefined;
				let sourcePane: Pane<TData> | undefined;
				let targetTab: Tab<TData> | undefined;
				for (const t of s.tabs) {
					if (t.panes[args.sourcePaneId]) {
						sourceTab = t;
						sourcePane = t.panes[args.sourcePaneId];
					}
					if (t.panes[args.targetPaneId]) {
						targetTab = t;
					}
				}
				if (!sourceTab || !sourcePane) return s;
				if (!targetTab || !targetTab.layout) return s;
				if (!findPaneInLayout(targetTab.layout, args.targetPaneId)) return s;
				if (args.sourcePaneId === args.targetPaneId) return s;

				const nextSourceLayout = removePaneFromLayout(
					sourceTab.layout,
					args.sourcePaneId,
				);
				const { [args.sourcePaneId]: _, ...nextSourcePanes } = sourceTab.panes;

				const nextTargetLayout = splitPaneInLayout(
					sourceTab.id === targetTab.id && nextSourceLayout
						? nextSourceLayout
						: targetTab.layout,
					args.targetPaneId,
					sourcePane.id,
					args.position,
				);

				const nextTabs = s.tabs
					.map((t) => {
						if (sourceTab.id === targetTab.id && t.id === sourceTab.id) {
							if (!nextSourceLayout) return null;
							return {
								...t,
								layout: nextTargetLayout,
								panes: { ...nextSourcePanes, [sourcePane.id]: sourcePane },
								activePaneId: sourcePane.id,
							};
						}
						if (t.id === sourceTab.id) {
							if (!nextSourceLayout) return null;
							return {
								...t,
								layout: nextSourceLayout,
								panes: nextSourcePanes,
								activePaneId: getActivePaneIdAfterRemoval(
									sourceTab.layout,
									nextSourceLayout,
									t.activePaneId,
									args.sourcePaneId,
								),
							};
						}
						if (t.id === targetTab.id) {
							return {
								...t,
								layout: nextTargetLayout,
								panes: { ...t.panes, [sourcePane.id]: sourcePane },
								activePaneId: sourcePane.id,
							};
						}
						return t;
					})
					.filter((t): t is Tab<TData> => t !== null);

				return { tabs: nextTabs, activeTabId: targetTab.id };
			});
		},

		movePaneToTab: (args) => {
			set((s) => {
				let sourceTab: Tab<TData> | undefined;
				let pane: Pane<TData> | undefined;
				for (const t of s.tabs) {
					if (t.panes[args.paneId]) {
						sourceTab = t;
						pane = t.panes[args.paneId];
						break;
					}
				}
				if (!sourceTab || !pane || !sourceTab.layout) return s;

				const targetTab = s.tabs.find((t) => t.id === args.targetTabId);
				if (!targetTab || !targetTab.layout) return s;
				if (sourceTab.id === targetTab.id) return s;

				const nextSourceLayout = removePaneFromLayout(
					sourceTab.layout,
					args.paneId,
				);
				const { [args.paneId]: _, ...nextSourcePanes } = sourceTab.panes;

				const paneLeaf: LayoutNode = { type: "pane", paneId: pane.id };
				const nextTargetLayout: LayoutNode = {
					type: "split",
					direction: "horizontal",
					first: targetTab.layout,
					second: paneLeaf,
				};

				const nextTabs = s.tabs
					.map((t) => {
						if (t.id === sourceTab.id) {
							if (!nextSourceLayout) return null;
							return {
								...t,
								layout: nextSourceLayout,
								panes: nextSourcePanes,
								activePaneId: getActivePaneIdAfterRemoval(
									sourceTab.layout,
									nextSourceLayout,
									t.activePaneId,
									args.paneId,
								),
							};
						}
						if (t.id === targetTab.id) {
							return {
								...t,
								layout: nextTargetLayout,
								panes: { ...t.panes, [pane.id]: pane },
								activePaneId: pane.id,
							};
						}
						return t;
					})
					.filter((t): t is Tab<TData> => t !== null);

				return { tabs: nextTabs, activeTabId: targetTab.id };
			});
		},

		movePaneToNewTab: (args) => {
			set((s) => {
				let sourceTab: Tab<TData> | undefined;
				let pane: Pane<TData> | undefined;
				let sourceTabIndex = -1;
				for (const [index, t] of s.tabs.entries()) {
					if (t.panes[args.paneId]) {
						sourceTab = t;
						pane = t.panes[args.paneId];
						sourceTabIndex = index;
						break;
					}
				}
				if (!sourceTab || !pane || !sourceTab.layout) return s;

				const nextSourceLayout = removePaneFromLayout(
					sourceTab.layout,
					args.paneId,
				);
				const { [args.paneId]: _, ...nextSourcePanes } = sourceTab.panes;

				const newTab = buildTab({
					panes: [pane],
					activePaneId: pane.id,
				});

				const nextTabs = s.tabs
					.map((t) => {
						if (t.id === sourceTab.id) {
							if (!nextSourceLayout) return null;
							return {
								...t,
								layout: nextSourceLayout,
								panes: nextSourcePanes,
								activePaneId: getActivePaneIdAfterRemoval(
									sourceTab.layout,
									nextSourceLayout,
									t.activePaneId,
									args.paneId,
								),
							};
						}
						return t;
					})
					.filter((t): t is Tab<TData> => t !== null);

				const requestedIndex = args.toIndex ?? nextTabs.length;
				const adjustedIndex =
					args.toIndex !== undefined &&
					!nextSourceLayout &&
					sourceTabIndex < args.toIndex
						? args.toIndex - 1
						: requestedIndex;
				const insertIndex = Math.max(
					0,
					Math.min(adjustedIndex, nextTabs.length),
				);

				nextTabs.splice(insertIndex, 0, newTab);

				return { tabs: nextTabs, activeTabId: newTab.id };
			});
		},

		moveTabToSplit: (args) => {
			set((s) => {
				const sourceTab = s.tabs.find((t) => t.id === args.sourceTabId);
				if (!sourceTab || !sourceTab.layout) return s;

				const targetTab = s.tabs.find((t) => t.panes[args.targetPaneId]);
				if (!targetTab || !targetTab.layout) return s;
				// Merging a tab into one of its own panes is a no-op.
				if (sourceTab.id === targetTab.id) return s;
				if (!findPaneInLayout(targetTab.layout, args.targetPaneId)) return s;

				// Graft the source's whole layout subtree so its internal split
				// arrangement is preserved, rather than re-adding panes one by one.
				const nextTargetLayout = graftSubtreeAtPane(
					targetTab.layout,
					args.targetPaneId,
					sourceTab.layout,
					args.position,
				);

				const nextTabs = s.tabs
					.filter((t) => t.id !== sourceTab.id)
					.map((t) =>
						t.id === targetTab.id
							? {
									...t,
									layout: nextTargetLayout,
									panes: { ...t.panes, ...sourceTab.panes },
									activePaneId: sourceTab.activePaneId ?? t.activePaneId,
								}
							: t,
					);

				return { tabs: nextTabs, activeTabId: targetTab.id };
			});
		},

		reorderTab: (args) => {
			set((s) => {
				const fromIndex = s.tabs.findIndex((t) => t.id === args.tabId);
				if (fromIndex === -1) return s;
				const toIndex = Math.max(0, Math.min(args.toIndex, s.tabs.length - 1));
				if (fromIndex === toIndex) return s;
				const nextTabs = [...s.tabs];
				const [tab] = nextTabs.splice(fromIndex, 1);
				if (!tab) return s;
				nextTabs.splice(toIndex, 0, tab);
				return { tabs: nextTabs };
			});
		},

		replaceState: (next) => {
			set((s) => {
				const resolved =
					typeof next === "function"
						? next({
								version: s.version,
								tabs: s.tabs,
								activeTabId: s.activeTabId,
							})
						: next;
				return {
					version: resolved.version,
					tabs: resolved.tabs,
					activeTabId: resolved.activeTabId,
				};
			});
		},
	}));
}
