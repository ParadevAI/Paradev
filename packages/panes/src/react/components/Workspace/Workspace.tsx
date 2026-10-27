import { cn } from "@superset/ui/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDragLayer } from "react-dnd";
import { useStore } from "zustand";
import { isPaneInLinkedStore } from "../../../core/transfer";
import type { Pane, Tab as TabType } from "../../../types";
import type { WorkspaceProps } from "../../types";
import { KeptTab } from "./components/KeptTab";
import { Tab } from "./components/Tab";
import { TabBar } from "./components/TabBar";
import { TAB_DRAG_TYPE } from "./components/TabBar/components/TabItem";
import { useWorkspaceInteractionState } from "./hooks/useWorkspaceInteractionState";
import { type KeptTabEntry, nextKeptTabs } from "./utils/nextKeptTabs";
import { notifyClosedPanes } from "./utils/notifyClosedPanes";

const NO_KEPT_TABS: readonly KeptTabEntry[] = [];

export function Workspace<TData>({
	store,
	registry,
	className,
	renderTabAccessory,
	renderTabIcon,
	renderEmptyState,
	renderAddTabMenu,
	onAddTab,
	renderTabBarLeading,
	renderTabBarTrailing,
	renderBelowTabBar,
	onBeforeCloseTab,
	onAfterCloseTab,
	onInteractionStateChange,
	paneActions,
	contextMenuActions,
	onPaneError,
	keepAliveTabs = 0,
}: WorkspaceProps<TData>) {
	const tabs = useStore(store, (s) => s.tabs);
	const activeTabId = useStore(store, (s) => s.activeTabId);
	const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
	const { onSplitResizeDragging } = useWorkspaceInteractionState({
		onInteractionStateChange,
	});

	// The tab id currently being dragged in the tab bar, if any.
	const draggedTabId = useDragLayer((monitor) => {
		if (!monitor.isDragging() || monitor.getItemType() !== TAB_DRAG_TYPE) {
			return null;
		}
		const item = monitor.getItem() as { tabId?: string } | null;
		return item?.tabId ?? null;
	});

	// While dragging the active tab, render its neighbor (preceding tab, or the
	// next one when dragging the first tab) instead. Dropping a tab onto its own
	// view is a no-op (you'd merge it into itself), so showing a sibling lets
	// you see — and drop onto — an actual merge target.
	const displayedTab = useMemo(() => {
		if (draggedTabId && draggedTabId === activeTabId) {
			const index = tabs.findIndex((t) => t.id === draggedTabId);
			if (index > 0) return tabs[index - 1];
			if (index === 0 && tabs.length > 1) return tabs[1];
		}
		return activeTab;
	}, [draggedTabId, activeTabId, tabs, activeTab]);

	const keepableTabIds = useMemo(() => {
		if (keepAliveTabs <= 0) return null;
		return new Set(
			tabs
				.filter((tab) =>
					Object.values(tab.panes).every(
						(pane) => registry[pane.kind]?.keepAlive === true,
					),
				)
				.map((tab) => tab.id),
		);
	}, [keepAliveTabs, tabs, registry]);
	const [keptTabs, setKeptTabs] = useState(NO_KEPT_TABS);
	const nextKept = keepableTabIds
		? nextKeptTabs({
				previous: keptTabs,
				activeTabId,
				isKeepable: (tabId) => keepableTabIds.has(tabId),
				maxHidden: keepAliveTabs,
			})
		: NO_KEPT_TABS;
	if (nextKept !== keptTabs) setKeptTabs(nextKept);

	const mountedTabs = useMemo(() => {
		const byId = new Map(tabs.map((tab) => [tab.id, tab]));
		const mounted: TabType<TData>[] = [];
		for (const kept of nextKept) {
			const tab = byId.get(kept.tabId);
			if (tab) mounted.push(tab);
		}
		if (displayedTab && !mounted.includes(displayedTab)) {
			mounted.push(displayedTab);
		}
		return mounted;
	}, [tabs, nextKept, displayedTab]);

	useEffect(
		() =>
			store.getState().subscribePaneClose((panes) => {
				notifyClosedPanes(panes, registry);
			}),
		[store, registry],
	);

	const previousPanesRef = useRef<Map<string, Pane<TData>>>(new Map());
	useEffect(() => {
		const current = new Map<string, Pane<TData>>();
		for (const tab of tabs) {
			for (const pane of Object.values(tab.panes)) {
				current.set(pane.id, pane);
			}
		}
		for (const [prevId, prevPane] of previousPanesRef.current) {
			if (!current.has(prevId) && !isPaneInLinkedStore(prevId)) {
				registry[prevPane.kind]?.onAfterRemove?.(prevPane);
			}
		}
		previousPanesRef.current = current;
	}, [tabs, registry]);

	const closeTab = async (tabId: string) => {
		const tab = store.getState().getTab(tabId);
		if (!tab) return;
		if (onBeforeCloseTab) {
			const allowed = await onBeforeCloseTab(tab);
			if (!allowed) return;
		}
		// Re-check after the await: the tab may have been removed concurrently.
		if (!store.getState().getTab(tabId)) return;
		store.getState().removeTab(tabId);
		try {
			onAfterCloseTab?.(tab);
		} catch (err) {
			console.error("onAfterCloseTab threw", err);
		}
	};

	return (
		<div
			className={cn(
				"flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden bg-background text-foreground",
				className,
			)}
		>
			<TabBar
				store={store}
				tabs={tabs}
				registry={registry}
				activeTabId={activeTabId}
				onSelectTab={(tabId) => store.getState().setActiveTab(tabId)}
				onCloseTab={closeTab}
				onCloseOtherTabs={async (tabId) => {
					for (const tab of tabs) {
						if (tab.id !== tabId) await closeTab(tab.id);
					}
				}}
				onCloseAllTabs={async () => {
					for (const tab of tabs) {
						await closeTab(tab.id);
					}
				}}
				onRenameTab={(tabId, title) =>
					store.getState().setTabTitleOverride({ tabId, titleOverride: title })
				}
				onReorderTab={(tabId, toIndex) =>
					store.getState().reorderTab({ tabId, toIndex })
				}
				onMovePaneToNewTab={(paneId, toIndex) =>
					store.getState().movePaneToNewTab({ paneId, toIndex })
				}
				renderTabIcon={renderTabIcon}
				renderAddTabMenu={renderAddTabMenu}
				onAddTab={onAddTab}
				renderTabBarLeading={renderTabBarLeading}
				renderTabBarTrailing={renderTabBarTrailing}
				renderTabAccessory={renderTabAccessory}
			/>
			{renderBelowTabBar?.()}
			{keepAliveTabs > 0 ? (
				<div className="relative min-h-0 min-w-0 flex-1">
					{mountedTabs.map((tab) => (
						<KeptTab
							key={tab.id}
							isVisible={tab.id === displayedTab?.id}
							store={store}
							tab={tab}
							registry={registry}
							paneActions={paneActions}
							contextMenuActions={contextMenuActions}
							onPaneError={onPaneError}
							onSplitResizeDragging={onSplitResizeDragging}
						/>
					))}
					{!displayedTab && (
						<div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
							{renderEmptyState?.() ?? "No tabs open"}
						</div>
					)}
				</div>
			) : displayedTab ? (
				<Tab
					store={store}
					tab={displayedTab}
					registry={registry}
					paneActions={paneActions}
					contextMenuActions={contextMenuActions}
					onPaneError={onPaneError}
					onSplitResizeDragging={onSplitResizeDragging}
				/>
			) : (
				<div className="flex min-h-0 min-w-0 flex-1 items-center justify-center text-sm text-muted-foreground">
					{renderEmptyState?.() ?? "No tabs open"}
				</div>
			)}
		</div>
	);
}
