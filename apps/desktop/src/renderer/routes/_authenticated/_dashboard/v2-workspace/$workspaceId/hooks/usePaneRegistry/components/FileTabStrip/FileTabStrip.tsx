import type { Pane, RendererContext } from "@superset/panes";
import { type ReactNode, useEffect, useRef } from "react";
import type { FilePaneData, PaneViewerData } from "../../../../types";
import { FileTab } from "./components/FileTab";

interface FileTabStripProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
	onBeforeClose: (pane: Pane<PaneViewerData>) => boolean | Promise<boolean>;
	actions: ReactNode;
}

export function FileTabStrip({
	context,
	workspaceId,
	onBeforeClose,
	actions,
}: FileTabStripProps) {
	const { store, tab } = context;
	const listRef = useRef<HTMLDivElement>(null);
	const shownPaneId = context.pane.id;

	useEffect(() => {
		const list = listRef.current;
		if (!list || !shownPaneId) return;
		const reveal = () => {
			const shown = list.querySelector<HTMLElement>('[aria-selected="true"]');
			if (!shown) return;
			const start = shown.offsetLeft;
			const end = start + shown.offsetWidth;
			if (start < list.scrollLeft) list.scrollLeft = start;
			else if (end > list.scrollLeft + list.clientWidth)
				list.scrollLeft = end - list.clientWidth;
		};
		reveal();
		const observer = new ResizeObserver(reveal);
		observer.observe(list);
		return () => observer.disconnect();
	}, [shownPaneId]);
	const filePanes = Object.values(tab.panes).filter(
		(pane) => pane.kind === "file",
	);

	const close = async (pane: Pane<PaneViewerData>) => {
		if (!(await onBeforeClose(pane))) return;
		store.getState().closePane({ tabId: tab.id, paneId: pane.id });
	};

	return (
		<div className="flex h-full w-full min-w-0 items-center">
			<div
				ref={listRef}
				role="tablist"
				className="hide-scrollbar relative flex h-full min-w-0 flex-1 items-stretch overflow-x-auto"
			>
				{filePanes.map((pane) => (
					<FileTab
						key={pane.id}
						workspaceId={workspaceId}
						filePath={(pane.data as FilePaneData).filePath}
						pinned={Boolean(pane.pinned)}
						isShown={pane.id === context.pane.id}
						isActive={pane.id === context.pane.id && context.isActive}
						onSelect={() => store.getState().focusPane(pane.id)}
						onPin={() =>
							store.getState().setPanePinned({ paneId: pane.id, pinned: true })
						}
						onClose={() => void close(pane)}
					/>
				))}
			</div>
			<div className="flex min-w-0 max-w-[40%] shrink items-center justify-end gap-0.5 overflow-hidden px-1">
				{actions}
			</div>
		</div>
	);
}
