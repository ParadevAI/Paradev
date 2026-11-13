import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { useDrop } from "react-dnd";
import type { StoreApi } from "zustand/vanilla";
import type { WorkspaceStore } from "../../../../../core/store";
import {
	transferPaneToNewTab,
	transferTabToIndex,
} from "../../../../../core/transfer";
import { PANE_DRAG_TYPE } from "../Tab/components/Pane/components/PaneHeader";
import { TAB_DRAG_TYPE } from "../TabBar/components/TabItem";

type DropItem = { tabId?: string; paneId?: string; store?: unknown };

export function EmptyAreaDropZone<TData>({
	store,
	className,
	children,
}: {
	store: StoreApi<WorkspaceStore<TData>>;
	className?: string;
	children: ReactNode;
}) {
	const [{ isOver, canDrop }, connectDrop] = useDrop(
		() => ({
			accept: [TAB_DRAG_TYPE, PANE_DRAG_TYPE],
			canDrop: (item: DropItem) => !!item.store && item.store !== store,
			drop: (item: DropItem, monitor) => {
				if (monitor.didDrop()) return;
				const source = item.store as typeof store;
				if (monitor.getItemType() === PANE_DRAG_TYPE && item.paneId) {
					transferPaneToNewTab({ source, target: store, paneId: item.paneId });
				} else if (item.tabId) {
					transferTabToIndex({ source, target: store, tabId: item.tabId });
				}
			},
			collect: (monitor) => ({
				isOver: monitor.isOver(),
				canDrop: monitor.canDrop(),
			}),
		}),
		[store],
	);

	return (
		<div
			ref={(node) => {
				connectDrop(node);
			}}
			className={cn(className, isOver && canDrop && "bg-primary/5")}
		>
			{children}
		</div>
	);
}
