import type { MosaicBranch } from "react-mosaic-component";
import { ChatUnderConstruction } from "renderer/components/ChatUnderConstruction";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { SplitPaneOptions, Tab } from "renderer/stores/tabs/types";
import { TabContentContextMenu } from "../../TabContentContextMenu";
import { BasePaneWindow, PaneToolbarActions } from "../components";

interface ChatPaneProps {
	paneId: string;
	path: MosaicBranch[];
	tabId: string;
	workspaceId: string;
	splitPaneAuto: (
		tabId: string,
		sourcePaneId: string,
		dimensions: { width: number; height: number },
		path?: MosaicBranch[],
	) => void;
	splitPaneHorizontal: (
		tabId: string,
		sourcePaneId: string,
		path?: MosaicBranch[],
		options?: SplitPaneOptions,
	) => void;
	splitPaneVertical: (
		tabId: string,
		sourcePaneId: string,
		path?: MosaicBranch[],
		options?: SplitPaneOptions,
	) => void;
	removePane: (paneId: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
	availableTabs: Tab[];
	onMoveToTab: (targetTabId: string) => void;
	onMoveToNewTab: () => void;
}

// Chat is temporarily disabled while it's being reworked; the pane keeps its
// chrome (toolbar, split/close, context menu) but renders a placeholder.
export function ChatPane({
	paneId,
	path,
	tabId,
	splitPaneAuto,
	splitPaneHorizontal,
	splitPaneVertical,
	removePane,
	setFocusedPane,
	availableTabs,
	onMoveToTab,
	onMoveToNewTab,
}: ChatPaneProps) {
	const equalizePaneSplits = useTabsStore((s) => s.equalizePaneSplits);
	const paneName = useTabsStore((s) => s.panes[paneId]?.name ?? "New Chat");

	return (
		<BasePaneWindow
			paneId={paneId}
			path={path}
			tabId={tabId}
			splitPaneAuto={splitPaneAuto}
			removePane={removePane}
			setFocusedPane={setFocusedPane}
			renderToolbar={(handlers) => (
				<div className="flex h-full w-full items-center justify-between px-3">
					<span className="min-w-0 flex-1 truncate pr-2 text-sm">
						{paneName}
					</span>
					<PaneToolbarActions
						splitOrientation={handlers.splitOrientation}
						onSplitPane={handlers.onSplitPane}
						onClosePane={handlers.onClosePane}
					/>
				</div>
			)}
		>
			<TabContentContextMenu
				onSplitHorizontal={() => splitPaneHorizontal(tabId, paneId, path)}
				onSplitVertical={() => splitPaneVertical(tabId, paneId, path)}
				onSplitWithNewChat={() =>
					splitPaneVertical(tabId, paneId, path, {
						paneType: "chat",
					})
				}
				onSplitWithNewBrowser={() =>
					splitPaneVertical(tabId, paneId, path, { paneType: "webview" })
				}
				onEqualizePaneSplits={() => equalizePaneSplits(tabId)}
				onClosePane={() => removePane(paneId)}
				currentTabId={tabId}
				availableTabs={availableTabs}
				onMoveToTab={onMoveToTab}
				onMoveToNewTab={onMoveToNewTab}
				closeLabel="Close Chat"
			>
				<div className="h-full w-full">
					<ChatUnderConstruction />
				</div>
			</TabContentContextMenu>
		</BasePaneWindow>
	);
}
