import { EventEmitter } from "node:events";
import type {
	PaneLayoutOp,
	PaneLayoutOpResult,
} from "@superset/shared/pane-layout-ops";
import {
	applyPaneLayoutOp,
	describePaneLayout,
	type PaneAreas,
	PaneLayoutOpError,
} from "shared/pane-layout";
import {
	emptyWorkspaceView,
	getAreaLayout,
	isRightPaneOpen,
	type RightPaneState,
	type WorkspaceView,
	withAreaLayout,
} from "shared/workspace-views";

export interface WorkspaceViewStorage {
	readAll(): WorkspaceView[];
	read(workspaceId: string): WorkspaceView | undefined;
	write(view: WorkspaceView): void;
	delete(workspaceId: string): void;
}

export type WorkspaceViewChange =
	| { type: "put"; view: WorkspaceView }
	| { type: "remove"; workspaceId: string }
	| { type: "terminal-kept"; workspaceId: string; terminalId: string };

const PANE_AREAS = ["main", "sidebar"] as const;

function keptTerminalId(areas: PaneAreas, op: PaneLayoutOp): string | null {
	if (op.type !== "close" || !op.keepTerminal) return null;
	for (const tab of [...areas.main.tabs, ...areas.sidebar.tabs]) {
		const pane = tab.panes[op.paneId];
		if (pane?.kind === "terminal") {
			return (pane.data as { terminalId: string }).terminalId;
		}
	}
	return null;
}

function withVisibility(
	view: WorkspaceView,
	request: { open: boolean; fullScreen?: boolean },
): WorkspaceView {
	const { rightPane } = view;
	let next: RightPaneState;
	if (!request.open) {
		next = { ...rightPane, visibility: "closed", fullScreenExitsTo: undefined };
	} else if (request.fullScreen) {
		next = {
			...rightPane,
			visibility: "fullScreen",
			fullScreenExitsTo:
				rightPane.visibility === "fullScreen"
					? rightPane.fullScreenExitsTo
					: rightPane.visibility === "closed"
						? "closed"
						: "open",
		};
	} else {
		next = { ...rightPane, visibility: "open", fullScreenExitsTo: undefined };
	}
	return { ...view, rightPane: next };
}

/** The desktop's workspace views; every write goes through here and is broadcast. */
export class WorkspaceViews extends EventEmitter {
	constructor(private readonly storage: WorkspaceViewStorage) {
		super();
	}

	list(): WorkspaceView[] {
		return this.storage.readAll();
	}

	get(workspaceId: string): WorkspaceView | undefined {
		return this.storage.read(workspaceId);
	}

	put(view: WorkspaceView): void {
		this.storage.write(view);
		this.emit("change", { type: "put", view } satisfies WorkspaceViewChange);
	}

	remove(workspaceId: string): void {
		this.storage.delete(workspaceId);
		this.emit("change", {
			type: "remove",
			workspaceId,
		} satisfies WorkspaceViewChange);
	}

	apply(workspaceId: string, op: PaneLayoutOp): PaneLayoutOpResult {
		const stored = this.get(workspaceId);
		if (!stored && op.type !== "list") {
			throw new PaneLayoutOpError(
				"PRECONDITION_FAILED",
				"This workspace has no pane layout in the desktop app yet. Open it there once, then retry.",
			);
		}
		const current = stored ?? emptyWorkspaceView(workspaceId);
		const previous: PaneAreas = {
			main: getAreaLayout(current, "main"),
			sidebar: getAreaLayout(current, "sidebar"),
		};
		const outcome = applyPaneLayoutOp(previous, op);

		let next = current;
		for (const area of PANE_AREAS) {
			if (outcome.areas[area] !== previous[area]) {
				next = withAreaLayout(next, area, outcome.areas[area]);
			}
		}
		if (op.type === "sidebar") {
			next = withVisibility(next, op);
		} else if (outcome.showSidebar && !isRightPaneOpen(next)) {
			next = withVisibility(next, { open: true });
		}
		if (next !== current) this.put(next);

		const terminalId = keptTerminalId(previous, op);
		if (terminalId) {
			this.emit("change", {
				type: "terminal-kept",
				workspaceId,
				terminalId,
			} satisfies WorkspaceViewChange);
		}

		return {
			paneId: outcome.paneId,
			tabId: outcome.tabId,
			layout: {
				...describePaneLayout(outcome.areas.main),
				sidebar: {
					open: isRightPaneOpen(next),
					fullScreen: next.rightPane.visibility === "fullScreen",
					...describePaneLayout(outcome.areas.sidebar),
				},
			},
		};
	}
}
