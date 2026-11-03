import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import {
	CAPSULE_TAB_SLOT_CLASS,
	HEADER_ICON_BUTTON_CLASS,
	HEADER_ICON_STROKE_WIDTH,
	TAB_DIVIDER_CLASS,
	tabCapsuleClassName,
} from "@superset/ui/lib/header-controls";
import { OverflowFadeContainer } from "@superset/ui/overflow-fade-container";
import { cn } from "@superset/ui/utils";
import { PlusIcon } from "lucide-react";
import {
	type ComponentProps,
	type ReactNode,
	useCallback,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { useDrop } from "react-dnd";
import type { StoreApi } from "zustand/vanilla";
import type { WorkspaceStore } from "../../../../../core/store";
import {
	transferPaneToNewTab,
	transferTabToIndex,
} from "../../../../../core/transfer";
import type { Tab } from "../../../../../types";
import { usePaneAppearance } from "../../../../hooks/usePaneAppearance";
import type { AddTabMenuActions, PaneRegistry } from "../../../../types";
import { PANE_DRAG_TYPE } from "../Tab/components/Pane/components/PaneHeader";
import { TAB_DRAG_TYPE, TabItem } from "./components/TabItem";
import {
	computeInsertIndex,
	scrollLeftToRevealTab,
	TAB_BAR_FADE_WIDTH,
	TAB_WIDTH,
} from "./utils";

const INSERT_LINE_CLASS =
	"pointer-events-none absolute top-0 z-10 h-full w-0.5 bg-primary opacity-85";

function readTabSlots(track: HTMLElement): HTMLElement[] {
	return Array.from(
		track.querySelectorAll<HTMLElement>(":scope > [data-tab-slot]"),
	);
}

interface TabBarProps<TData> {
	/** Classes for the bar row, merged over its defaults. */
	className?: string;
	store: StoreApi<WorkspaceStore<TData>>;
	tabs: Tab<TData>[];
	registry: PaneRegistry<TData>;
	activeTabId: string | null;
	onSelectTab: (tabId: string) => void;
	onCloseTab: (tabId: string) => void;
	onCloseOtherTabs: (tabId: string) => void;
	onCloseAllTabs: () => void;
	onRenameTab?: (tabId: string, title: string | undefined) => void;
	onTabClick?: (tab: Tab<TData>) => void;
	isPreviewTab?: (tab: Tab<TData>) => boolean;
	onReorderTab: (tabId: string, toIndex: number) => void;
	onMovePaneToNewTab: (paneId: string, toIndex: number) => void;
	renderTabIcon?: (tab: Tab<TData>) => ReactNode;
	renderAddTabMenu?: (actions: AddTabMenuActions) => ReactNode;
	onAddTab?: () => void;
	renderTabBarLeading?: () => ReactNode;
	renderTabBarTrailing?: () => ReactNode;
	renderTabAccessory?: (tab: Tab<TData>) => ReactNode;
}

type TabDragItem = { tabId: string; store?: unknown };
type PaneDragItem = { paneId: string; store?: unknown };

function AddTabButton<_TData>({
	renderAddTabMenu,
	onAddTab,
}: {
	renderAddTabMenu?: (actions: AddTabMenuActions) => ReactNode;
	onAddTab?: () => void;
}) {
	const pendingActionRef = useRef<(() => void) | null>(null);
	const isCards = usePaneAppearance() === "cards";
	const button = isCards ? (
		<button
			className={HEADER_ICON_BUTTON_CLASS}
			type="button"
			onClick={onAddTab}
		>
			<PlusIcon className="size-4" strokeWidth={HEADER_ICON_STROKE_WIDTH} />
		</button>
	) : (
		<Button
			className="ml-1.5 size-7 rounded-md border border-border/60 bg-muted/30 px-1 text-muted-foreground shadow-none hover:bg-accent/60 hover:text-foreground"
			size="icon"
			type="button"
			variant="ghost"
			onClick={onAddTab}
		>
			<PlusIcon className="size-3.5" />
		</Button>
	);

	if (renderAddTabMenu) {
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
				<DropdownMenuContent
					align="end"
					className="w-56"
					onCloseAutoFocus={(event) => {
						const action = pendingActionRef.current;
						if (!action) return;
						pendingActionRef.current = null;
						event.preventDefault();
						action();
					}}
				>
					{renderAddTabMenu({
						runAfterClose: (action) => {
							pendingActionRef.current = action;
						},
					})}
				</DropdownMenuContent>
			</DropdownMenu>
		);
	}

	return button;
}

export function TabBar<TData>({
	className,
	store,
	tabs,
	registry,
	activeTabId,
	onSelectTab,
	onCloseTab,
	onCloseOtherTabs,
	onCloseAllTabs,
	onRenameTab,
	onTabClick,
	isPreviewTab,
	onReorderTab,
	onMovePaneToNewTab,
	renderTabIcon,
	renderAddTabMenu,
	onAddTab,
	renderTabBarLeading,
	renderTabBarTrailing,
	renderTabAccessory,
}: TabBarProps<TData>) {
	const isCards = usePaneAppearance() === "cards";
	const tabsTrackRef = useRef<HTMLDivElement>(null);
	const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);
	const activeTabIndex = tabs.findIndex((tab) => tab.id === activeTabId);
	useLayoutEffect(() => {
		const track = tabsTrackRef.current;
		const scroller = track?.parentElement;
		if (!track || !scroller || !hasHorizontalOverflow || activeTabIndex < 0)
			return;
		const reveal = (behavior: ScrollBehavior) => {
			const slot = readTabSlots(track)[activeTabIndex];
			if (!slot) return;
			const left = track.offsetLeft + slot.offsetLeft;
			const next = scrollLeftToRevealTab(
				{ left, right: left + slot.offsetWidth },
				scroller.scrollLeft,
				scroller.clientWidth,
				TAB_BAR_FADE_WIDTH,
			);
			if (next !== null) scroller.scrollTo({ left: next, behavior });
		};
		reveal("smooth");
		let revealedWidth = scroller.clientWidth;
		const observer = new ResizeObserver(() => {
			if (scroller.clientWidth === revealedWidth) return;
			revealedWidth = scroller.clientWidth;
			reveal("instant");
		});
		observer.observe(scroller);
		return () => observer.disconnect();
	}, [activeTabIndex, hasHorizontalOverflow]);

	const insertIndexRef = useRef<number | null>(null);
	const [insertIndex, setInsertIndex] = useState<number | null>(null);

	const [{ isOver }, connectDrop] = useDrop(
		() => ({
			accept: [TAB_DRAG_TYPE, PANE_DRAG_TYPE],
			hover: (_item: TabDragItem | PaneDragItem, monitor) => {
				const track = tabsTrackRef.current;
				const offset = monitor.getClientOffset();
				if (!track || !offset) return;

				const idx = computeInsertIndex(
					offset.x,
					readTabSlots(track).map((slot) => {
						const rect = slot.getBoundingClientRect();
						return { left: rect.left, right: rect.right };
					}),
				);
				if (idx !== insertIndexRef.current) {
					insertIndexRef.current = idx;
					setInsertIndex(idx);
				}
			},
			drop: (item: TabDragItem | PaneDragItem, monitor) => {
				const idx = insertIndexRef.current;
				if (idx === null) return;

				insertIndexRef.current = null;
				setInsertIndex(null);

				const source = item.store as typeof store | undefined;
				if (source && source !== store) {
					if (monitor.getItemType() === PANE_DRAG_TYPE && "paneId" in item) {
						transferPaneToNewTab({
							source,
							target: store,
							paneId: item.paneId,
							toIndex: idx,
						});
					} else if ("tabId" in item) {
						transferTabToIndex({
							source,
							target: store,
							tabId: item.tabId,
							toIndex: idx,
						});
					}
					return;
				}

				if (monitor.getItemType() === PANE_DRAG_TYPE && "paneId" in item) {
					onMovePaneToNewTab(item.paneId, idx);
					return;
				}

				if (monitor.getItemType() !== TAB_DRAG_TYPE || !("tabId" in item)) {
					return;
				}

				const dragIndex = tabs.findIndex((t) => t.id === item.tabId);
				if (dragIndex === -1) return;

				// Adjust for removal of dragged tab
				let toIndex = idx;
				if (dragIndex < toIndex) toIndex--;

				onReorderTab(item.tabId, toIndex);
			},
			collect: (monitor) => ({
				isOver: monitor.isOver(),
			}),
		}),
		[store, tabs, onReorderTab, onMovePaneToNewTab],
	);

	// Clear indicator when cursor leaves the tab bar
	if (!isOver && insertIndexRef.current !== null) {
		insertIndexRef.current = null;
		if (insertIndex !== null) setInsertIndex(null);
	}

	const setRootRef = useCallback(
		(node: HTMLDivElement | null) => {
			connectDrop(node);
		},
		[connectDrop],
	);

	const handleOverflowChange = useCallback<
		NonNullable<
			ComponentProps<typeof OverflowFadeContainer>["onOverflowChange"]
		>
	>((state) => {
		setHasHorizontalOverflow(state.hasOverflowX);
	}, []);

	const renderTabSlot = (tab: Tab<TData>, index: number) => (
		<div
			data-tab-slot=""
			className={
				isCards ? CAPSULE_TAB_SLOT_CLASS : "relative h-full shrink-0 pt-1"
			}
			key={tab.id}
			style={isCards ? undefined : { width: TAB_WIDTH }}
		>
			{isCards &&
				index > 0 &&
				index !== activeTabIndex &&
				index - 1 !== activeTabIndex && <span className={TAB_DIVIDER_CLASS} />}
			<TabItem
				tab={tab}
				tabs={tabs}
				store={store}
				registry={registry}
				index={index}
				isActive={tab.id === activeTabId}
				onSelect={() => onSelectTab(tab.id)}
				onClose={() => onCloseTab(tab.id)}
				onCloseOthers={() => onCloseOtherTabs(tab.id)}
				onCloseAll={onCloseAllTabs}
				onRename={
					onRenameTab ? (title) => onRenameTab(tab.id, title) : undefined
				}
				onClick={onTabClick ? () => onTabClick(tab) : undefined}
				isPreview={isPreviewTab?.(tab) ?? false}
				icon={renderTabIcon?.(tab)}
				accessory={renderTabAccessory?.(tab)}
			/>
			{insertIndex === index && (
				<div className={cn(INSERT_LINE_CLASS, "-left-px")} />
			)}
			{insertIndex === tabs.length && index === tabs.length - 1 && (
				<div className={cn(INSERT_LINE_CLASS, "-right-px")} />
			)}
		</div>
	);

	const addTabButton = (
		<AddTabButton renderAddTabMenu={renderAddTabMenu} onAddTab={onAddTab} />
	);

	// Only the empty filler right of the tabs is an Electron window-drag region.
	// Marking the whole bar `drag` and carving children out with `no-drag` loses
	// the carve-outs once they sit inside the masked, scrollable
	// OverflowFadeContainer, which made the entire bar swallow clicks.
	if (isCards) {
		return (
			<div
				ref={setRootRef}
				className={cn(
					"flex h-12 min-w-0 shrink-0 items-center shadow-[inset_0_-1px_0_var(--border)]",
					className,
				)}
			>
				{renderTabBarLeading && (
					<div className="flex h-full shrink-0 items-stretch self-stretch">
						{renderTabBarLeading()}
					</div>
				)}
				{tabs.length > 0 && (
					<div className={cn("no-drag ml-2", tabCapsuleClassName(tabs.length))}>
						<OverflowFadeContainer
							observeChildren
							onOverflowChange={handleOverflowChange}
							className="hide-scrollbar relative flex h-full min-w-0 flex-1 overflow-x-auto overflow-y-hidden rounded-full"
						>
							<div ref={tabsTrackRef} className="flex min-w-0 flex-1">
								{tabs.map(renderTabSlot)}
							</div>
						</OverflowFadeContainer>
					</div>
				)}
				<div className="no-drag ml-1.5 flex shrink-0 items-center">
					{addTabButton}
				</div>
				<div className="drag min-w-0 flex-1 self-stretch" />
				{renderTabBarTrailing && (
					<div className="no-drag flex shrink-0 items-center self-stretch px-1">
						{renderTabBarTrailing()}
					</div>
				)}
			</div>
		);
	}

	return (
		<div
			ref={setRootRef}
			className={cn(
				"group/root-tabs flex h-12 min-w-0 shrink-0 items-stretch bg-muted/45 shadow-[inset_0_-1px_0_var(--border)] dark:bg-muted/35",
				className,
			)}
		>
			{renderTabBarLeading && (
				<div className="flex h-full shrink-0 items-stretch border-b border-border">
					{renderTabBarLeading()}
				</div>
			)}
			<OverflowFadeContainer
				observeChildren
				onOverflowChange={handleOverflowChange}
				className="hide-scrollbar relative flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden"
			>
				<div
					ref={tabsTrackRef}
					className="no-drag relative flex h-full flex-1 items-stretch"
				>
					{tabs.map(renderTabSlot)}
					{!hasHorizontalOverflow && (
						<div className="flex h-full w-10 shrink-0 items-center justify-center pt-1">
							{addTabButton}
						</div>
					)}
					<div className="drag h-full flex-1 border-b border-border" />
				</div>
			</OverflowFadeContainer>
			{hasHorizontalOverflow && (
				<div className="no-drag flex h-full w-10 shrink-0 items-center justify-center pt-1">
					{addTabButton}
				</div>
			)}
			{renderTabBarTrailing && (
				<div className="no-drag flex h-full shrink-0 items-center border-b border-border px-1">
					{renderTabBarTrailing()}
				</div>
			)}
		</div>
	);
}
