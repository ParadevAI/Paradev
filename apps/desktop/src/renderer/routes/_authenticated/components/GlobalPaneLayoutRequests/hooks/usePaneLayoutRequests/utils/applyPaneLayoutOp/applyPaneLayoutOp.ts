import {
	type CreatePaneInput,
	createWorkspaceStore,
	findPanePath,
	type Pane,
	replacePaneIdInLayout,
	type SplitPosition,
	type Tab,
	type WorkspaceState,
	type WorkspaceStore,
} from "@superset/panes";
import type {
	PaneArea,
	PaneLayoutErrorCode,
	PaneLayoutOp,
	PaneSplitDirection,
} from "@superset/shared/pane-layout-ops";
import { DEFAULT_BROWSER_URL } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/BrowserPane/constants";
import { CENTER_PANE_KINDS } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useRightPaneAreaLifecycle/constants";
import { preserveLocalPaneSelection } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2WorkspacePaneLayout/utils/preserveLocalPaneSelection";
import type {
	BrowserPaneData,
	DiffPaneData,
	FilePaneData,
	PagesListPaneData,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { NEW_DIFF_PANE } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/openChangesPaneInStore";

type LayoutState = WorkspaceState<PaneViewerData>;

export type PaneAreas = Record<PaneArea, LayoutState>;

export class PaneLayoutOpError extends Error {
	constructor(
		readonly code: PaneLayoutErrorCode,
		message: string,
	) {
		super(message);
	}
}

export interface PaneLayoutOpOutcome {
	areas: PaneAreas;
	paneId: string | null;
	tabId: string | null;
	/** The op asks for the sidebar to be shown. */
	showSidebar: boolean;
}

type OpenOp = Extract<PaneLayoutOp, { type: "open" }>;

const SPLIT_POSITIONS: Record<PaneSplitDirection, SplitPosition> = {
	right: "right",
	left: "left",
	down: "bottom",
	up: "top",
};

interface Located {
	area: PaneArea;
	tab: Tab<PaneViewerData>;
	pane: Pane<PaneViewerData>;
}

function locatePane(areas: PaneAreas, paneId: string): Located {
	for (const area of ["main", "sidebar"] as const) {
		for (const tab of areas[area].tabs) {
			const pane = tab.panes[paneId];
			if (pane) return { area, tab, pane };
		}
	}
	throw new PaneLayoutOpError(
		"NOT_FOUND",
		`No pane ${paneId} in this workspace`,
	);
}

function snapshot(store: WorkspaceStore<PaneViewerData>): LayoutState {
	return { version: 1, tabs: store.tabs, activeTabId: store.activeTabId };
}

function runInStore(
	state: LayoutState,
	run: (store: WorkspaceStore<PaneViewerData>) => void,
): LayoutState {
	const store = createWorkspaceStore<PaneViewerData>({ initialState: state });
	run(store.getState());
	return snapshot(store.getState());
}

/** Takes a pane out of one area and hands it to `place` in the other. */
function runAcross(
	areas: PaneAreas,
	from: Located,
	to: PaneArea,
	place: (
		store: WorkspaceStore<PaneViewerData>,
		pane: Pane<PaneViewerData>,
	) => void,
): PaneAreas {
	const source = runInStore(areas[from.area], (store) =>
		store.closePane({
			tabId: from.tab.id,
			paneId: from.pane.id,
			intent: "remove",
		}),
	);
	const target = runInStore(areas[to], (store) => place(store, from.pane));
	return { ...areas, [from.area]: source, [to]: target };
}

function keepSelection(previous: PaneAreas, next: PaneAreas): PaneAreas {
	return {
		main: preserveLocalPaneSelection(previous.main, next.main),
		sidebar: preserveLocalPaneSelection(previous.sidebar, next.sidebar),
	};
}

/** The app moves any other kind of pane out of the main area as soon as it lands there. */
function requireMainAreaKind(located: Located): void {
	if (CENTER_PANE_KINDS.has(located.pane.kind)) return;
	throw new PaneLayoutOpError(
		"BAD_REQUEST",
		`Pane ${located.pane.id} is a ${located.pane.kind} pane, which stays in the sidebar. Only terminals and chats go in the main area`,
	);
}

function tabIdOf(areas: PaneAreas, paneId: string): string | null {
	return (
		[...areas.main.tabs, ...areas.sidebar.tabs].find((tab) => tab.panes[paneId])
			?.id ?? null
	);
}

function swapPanes(areas: PaneAreas, aId: string, bId: string): PaneAreas {
	if (aId === bId) {
		throw new PaneLayoutOpError(
			"BAD_REQUEST",
			"Cannot swap a pane with itself",
		);
	}
	const a = locatePane(areas, aId);
	const b = locatePane(areas, bId);
	if (a.area === "sidebar" && b.area === "main") requireMainAreaKind(a);
	if (b.area === "sidebar" && a.area === "main") requireMainAreaKind(b);
	if (a.tab.id === b.tab.id) {
		const placeholder = `${aId}:swap`;
		const layout = replacePaneIdInLayout(
			replacePaneIdInLayout(
				replacePaneIdInLayout(a.tab.layout, aId, placeholder),
				bId,
				aId,
			),
			placeholder,
			bId,
		);
		return {
			...areas,
			[a.area]: {
				...areas[a.area],
				tabs: areas[a.area].tabs.map((tab) =>
					tab.id === a.tab.id ? { ...tab, layout } : tab,
				),
			},
		};
	}
	const exchange = (
		tab: Tab<PaneViewerData>,
		outId: string,
		incoming: Pane<PaneViewerData>,
	): Tab<PaneViewerData> => {
		const { [outId]: _, ...rest } = tab.panes;
		return {
			...tab,
			layout: replacePaneIdInLayout(tab.layout, outId, incoming.id),
			panes: { ...rest, [incoming.id]: incoming },
			activePaneId: tab.activePaneId === outId ? incoming.id : tab.activePaneId,
		};
	};
	const swapIn = (state: LayoutState): LayoutState => ({
		...state,
		tabs: state.tabs.map((tab) => {
			if (tab.id === a.tab.id) return exchange(tab, aId, b.pane);
			if (tab.id === b.tab.id) return exchange(tab, bId, a.pane);
			return tab;
		}),
	});
	return { main: swapIn(areas.main), sidebar: swapIn(areas.sidebar) };
}

interface SidebarPane {
	tabId: string;
	paneId: string;
	data: PaneViewerData;
}

function findSidebarPane(
	areas: PaneAreas,
	matches: (pane: Pane<PaneViewerData>) => boolean,
): SidebarPane | null {
	for (const tab of areas.sidebar.tabs) {
		const pane = Object.values(tab.panes).find(matches);
		if (pane) return { tabId: tab.id, paneId: pane.id, data: pane.data };
	}
	return null;
}

function diffData(op: OpenOp, prev?: DiffPaneData): DiffPaneData {
	const base = prev ?? { ...NEW_DIFF_PANE.data };
	if (!op.path) return base;
	return {
		...base,
		path: op.path,
		changeKey: undefined,
		focusLine: op.line,
		focusTick: Date.now(),
	};
}

function fileData(op: OpenOp, filePath: string): FilePaneData {
	return {
		filePath,
		mode: "editor",
		viewId: "code",
		...(op.line ? { pendingPosition: { line: op.line } } : {}),
	};
}

/**
 * What `open` shows. A pane already showing the same thing is reused, with
 * `refresh` as its new data when the op points it somewhere else; a browser
 * always gets a new tab.
 */
function toolPane(
	areas: PaneAreas,
	op: OpenOp,
): {
	existing: SidebarPane | null;
	refresh?: PaneViewerData;
	pane: Omit<CreatePaneInput<PaneViewerData>, "id">;
} {
	switch (op.tool) {
		case "changes": {
			const existing = findSidebarPane(areas, (pane) => pane.kind === "diff");
			return {
				existing,
				refresh:
					existing && op.path
						? diffData(op, existing.data as DiffPaneData)
						: undefined,
				pane: { kind: NEW_DIFF_PANE.kind, data: diffData(op) },
			};
		}
		case "file": {
			if (!op.path) {
				throw new PaneLayoutOpError("BAD_REQUEST", "Say which file to open");
			}
			const filePath = op.path;
			const existing = findSidebarPane(
				areas,
				(pane) =>
					pane.kind === "file" &&
					(pane.data as FilePaneData).filePath === filePath,
			);
			return {
				existing,
				refresh:
					existing && op.line
						? { ...existing.data, ...fileData(op, filePath) }
						: undefined,
				pane: { kind: "file", data: fileData(op, filePath) },
			};
		}
		case "files":
			return {
				existing: findSidebarPane(areas, (pane) => pane.kind === "files"),
				pane: { kind: "files", data: { kind: "files" } },
			};
		case "pages": {
			const data: PagesListPaneData = op.slug
				? { kind: "pages-list", page: { slug: op.slug } }
				: { kind: "pages-list" };
			return {
				existing: findSidebarPane(
					areas,
					(pane) =>
						pane.kind === "pages-list" &&
						(!op.slug ||
							(pane.data as PagesListPaneData).page?.slug === op.slug),
				),
				pane: { kind: "pages-list", data },
			};
		}
		case "browser":
			return {
				existing: null,
				pane: {
					kind: "browser",
					data: { url: op.url ?? DEFAULT_BROWSER_URL } as BrowserPaneData,
				},
			};
	}
}

/**
 * Applies one CLI layout op to the main area and the right sidebar. Only
 * `focus` changes which tab and pane are active; every other op keeps the
 * caller's current selection. `sidebar` ops change no layout.
 */
export function applyPaneLayoutOp(
	areas: PaneAreas,
	op: PaneLayoutOp,
	createPaneId: () => string = () => `pane-${crypto.randomUUID()}`,
): PaneLayoutOpOutcome {
	const done = (
		next: PaneAreas,
		paneId: string | null,
		tabId: string | null,
		showSidebar = false,
	): PaneLayoutOpOutcome => ({ areas: next, paneId, tabId, showSidebar });
	const inArea = (
		area: PaneArea,
		run: (store: WorkspaceStore<PaneViewerData>) => void,
	): PaneAreas => ({ ...areas, [area]: runInStore(areas[area], run) });

	switch (op.type) {
		case "list":
		case "sidebar":
			return done(areas, null, null);

		case "split": {
			const { area, tab } = locatePane(areas, op.paneId);
			const paneId = createPaneId();
			const next = inArea(area, (store) =>
				store.splitPane({
					tabId: tab.id,
					paneId: op.paneId,
					position: SPLIT_POSITIONS[op.direction],
					newPane: {
						id: paneId,
						kind: "terminal",
						data: { terminalId: op.terminalId },
					},
				}),
			);
			return done(keepSelection(areas, next), paneId, tab.id);
		}

		case "resize": {
			const { area, tab } = locatePane(areas, op.paneId);
			const path = findPanePath(tab.layout, op.paneId);
			const branch = path?.at(-1);
			if (!path || !branch) {
				throw new PaneLayoutOpError(
					"BAD_REQUEST",
					`Pane ${op.paneId} is the only pane in its tab, so there is no split to resize`,
				);
			}
			const firstShare = branch === "first" ? op.ratio : 1 - op.ratio;
			const next = inArea(area, (store) =>
				store.resizeSplit({
					tabId: tab.id,
					path: path.slice(0, -1),
					splitPercentage: firstShare * 100,
				}),
			);
			return done(next, op.paneId, tab.id);
		}

		case "equalize": {
			const { tabId } = op;
			const allTabs = [...areas.main.tabs, ...areas.sidebar.tabs];
			if (tabId && !allTabs.some((tab) => tab.id === tabId)) {
				throw new PaneLayoutOpError(
					"NOT_FOUND",
					`No tab ${tabId} in this workspace`,
				);
			}
			const equalize = (state: LayoutState) =>
				runInStore(state, (store) => {
					for (const tab of state.tabs) {
						if (!tabId || tab.id === tabId)
							store.equalizeTab({ tabId: tab.id });
					}
				});
			return done(
				{ main: equalize(areas.main), sidebar: equalize(areas.sidebar) },
				null,
				tabId ?? null,
			);
		}

		case "focus": {
			const { area, tab } = locatePane(areas, op.paneId);
			const next = inArea(area, (store) =>
				store.setActivePane({ tabId: tab.id, paneId: op.paneId }),
			);
			return done(next, op.paneId, tab.id, area === "sidebar");
		}

		case "close": {
			const { area, tab } = locatePane(areas, op.paneId);
			const next = inArea(area, (store) =>
				store.closePane({ tabId: tab.id, paneId: op.paneId }),
			);
			return done(keepSelection(areas, next), op.paneId, tab.id);
		}

		case "move": {
			const source = locatePane(areas, op.paneId);
			const target = locatePane(areas, op.targetPaneId);
			if (op.paneId === op.targetPaneId) {
				throw new PaneLayoutOpError(
					"BAD_REQUEST",
					"Cannot move a pane next to itself",
				);
			}
			if (target.area === "main") requireMainAreaKind(source);
			const position = SPLIT_POSITIONS[op.direction];
			const next =
				source.area === target.area
					? inArea(source.area, (store) =>
							store.movePaneToSplit({
								sourcePaneId: op.paneId,
								targetPaneId: op.targetPaneId,
								position,
							}),
						)
					: runAcross(areas, source, target.area, (store, pane) =>
							store.splitPane({
								tabId: target.tab.id,
								paneId: op.targetPaneId,
								position,
								newPane: pane,
								selectNewPane: false,
							}),
						);
			return done(
				keepSelection(areas, next),
				op.paneId,
				tabIdOf(next, op.paneId),
			);
		}

		case "moveToNewTab": {
			const source = locatePane(areas, op.paneId);
			const area = op.area ?? source.area;
			if (area === "main") requireMainAreaKind(source);
			const next =
				area === source.area
					? inArea(area, (store) =>
							store.movePaneToNewTab({ paneId: op.paneId }),
						)
					: runAcross(areas, source, area, (store, pane) =>
							store.addTab({ panes: [pane], focus: false }),
						);
			return done(
				keepSelection(areas, next),
				op.paneId,
				tabIdOf(next, op.paneId),
			);
		}

		case "newTab": {
			const paneId = createPaneId();
			const next = inArea(op.area ?? "main", (store) =>
				store.addTab({
					panes: [
						{
							id: paneId,
							kind: "terminal",
							data: { terminalId: op.terminalId },
						},
					],
				}),
			);
			return done(keepSelection(areas, next), paneId, tabIdOf(next, paneId));
		}

		case "swap": {
			const next = swapPanes(areas, op.paneId, op.withPaneId);
			return done(
				keepSelection(areas, next),
				op.paneId,
				tabIdOf(next, op.paneId),
			);
		}

		case "open": {
			const { existing, refresh, pane } = toolPane(areas, op);
			let next = areas;
			let placed: { tabId: string; paneId: string } | null = existing;
			if (existing && refresh) {
				next = {
					...areas,
					sidebar: runInStore(areas.sidebar, (store) =>
						store.setPaneData({ paneId: existing.paneId, data: refresh }),
					),
				};
			}
			if (!placed) {
				const paneId = createPaneId();
				next = keepSelection(
					areas,
					inArea("sidebar", (store) =>
						store.addTab({ panes: [{ ...pane, id: paneId }], focus: false }),
					),
				);
				placed = { paneId, tabId: tabIdOf(next, paneId) ?? "" };
			}
			if (op.background) return done(next, placed.paneId, placed.tabId);
			const { paneId, tabId } = placed;
			const shown = {
				...next,
				sidebar: runInStore(next.sidebar, (store) =>
					store.setActivePane({ tabId, paneId }),
				),
			};
			return done(shown, paneId, tabId, true);
		}
	}
}
