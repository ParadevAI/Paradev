import { useLingui } from "@lingui/react/macro";
import {
	type ContextMenuActionConfig,
	type PaneActionConfig,
	type PaneRegistry,
	type Tab,
	Workspace,
	type WorkspaceInteractionState,
	type WorkspaceStore,
} from "@superset/panes";
import { type ReactNode, useEffect, useMemo } from "react";
import { LuMaximize2, LuMinimize2 } from "react-icons/lu";
import { reportRendererError } from "renderer/lib/report-renderer-error";
import { RightPaneHeaderButton } from "renderer/routes/_authenticated/_dashboard/components/RightPaneHeaderButton";
import { WindowChrome } from "renderer/routes/_authenticated/_dashboard/components/WindowChrome";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { getV2NotificationSourcesForTab } from "renderer/stores/v2-notifications";
import type { StoreApi } from "zustand/vanilla";
import { useNewTabLists } from "../../hooks/useNewTabLists";
import { renderBrowserTabIcon } from "../../hooks/usePaneRegistry/components/BrowserPane";
import type { PaneViewerData } from "../../types";
import { NEW_TAB_PANE } from "../RightPaneNewTab";
import { V2NotificationStatusIndicator } from "../V2NotificationStatusIndicator";
import { PullRequestCountsPrefetch } from "./components/PullRequestCountsPrefetch";
import {
	withNewTabSplitButton,
	withNewTabSplitMenu,
} from "./utils/withNewTabSplits";

const RIGHT_PANE_KEPT_TABS = 2;

function isPreviewTab(tab: Tab<PaneViewerData>): boolean {
	const panes = Object.values(tab.panes);
	return panes.length === 1 && panes[0]?.kind === "file" && !panes[0].pinned;
}

interface RightPaneAreaProps {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	registry: PaneRegistry<PaneViewerData>;
	paneActions: PaneActionConfig<PaneViewerData>[];
	contextMenuActions: ContextMenuActionConfig<PaneViewerData>[];
	onBeforeCloseTab: (tab: Tab<PaneViewerData>) => boolean | Promise<boolean>;
	onInteractionStateChange?: (state: WorkspaceInteractionState) => void;
	toolbar: ReactNode;
	isFullScreen: boolean;
	onToggleFullScreen: () => void;
}

export function RightPaneArea({
	store,
	registry,
	paneActions,
	contextMenuActions,
	onBeforeCloseTab,
	onInteractionStateChange,
	toolbar,
	isFullScreen,
	onToggleFullScreen,
}: RightPaneAreaProps) {
	const { t } = useLingui();
	const { workspace } = useWorkspace();
	// Keeps the New Tab's lists cached and fresh while the workspace is open.
	const { pullRequests } = useNewTabLists(workspace.id);
	const rightPaneActions = useMemo(
		() => withNewTabSplitButton(paneActions),
		[paneActions],
	);
	const rightContextMenuActions = useMemo(
		() => withNewTabSplitMenu(contextMenuActions),
		[contextMenuActions],
	);
	useEffect(() => {
		if (!isFullScreen) return;
		const active = store.getState().getActivePane();
		if (active) store.getState().focusPane(active.pane.id);
	}, [isFullScreen, store]);

	return (
		<div className="contents" data-pane-area="right">
			{pullRequests.map((pr) => (
				<PullRequestCountsPrefetch key={pr.url} pullRequest={pr.ref} />
			))}
			<Workspace<PaneViewerData>
				keepAliveTabs={RIGHT_PANE_KEPT_TABS}
				registry={registry}
				paneActions={rightPaneActions}
				contextMenuActions={rightContextMenuActions}
				onPaneError={reportRendererError}
				renderTabIcon={renderBrowserTabIcon}
				renameTabs={false}
				isPreviewTab={isPreviewTab}
				onTabClick={(tab) => {
					if (!isPreviewTab(tab)) return;
					for (const pane of Object.values(tab.panes)) {
						store.getState().setPanePinned({ paneId: pane.id, pinned: true });
					}
				}}
				renderTabAccessory={(tab) => (
					<V2NotificationStatusIndicator
						sources={getV2NotificationSourcesForTab(tab)}
					/>
				)}
				renderTabBarLeading={isFullScreen ? () => <WindowChrome /> : undefined}
				onAddTab={() => store.getState().addTab({ panes: [NEW_TAB_PANE] })}
				renderTabBarTrailing={() => (
					<div className="flex items-center gap-1 pr-1">
						<RightPaneHeaderButton
							label={
								isFullScreen
									? t({ message: "Restore width" })
									: t({ message: "Expand" })
							}
							hotkeyId="TOGGLE_RIGHT_PANE_FULL_SCREEN"
							onClick={onToggleFullScreen}
						>
							{isFullScreen ? (
								<LuMinimize2 className="size-4" strokeWidth={1.5} />
							) : (
								<LuMaximize2 className="size-4" strokeWidth={1.5} />
							)}
						</RightPaneHeaderButton>
						{toolbar}
					</div>
				)}
				onBeforeCloseTab={onBeforeCloseTab}
				onInteractionStateChange={onInteractionStateChange}
				store={store}
			/>
		</div>
	);
}
