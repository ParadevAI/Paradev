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
import { type ReactNode, useEffect } from "react";
import { LuMaximize2, LuMinimize2 } from "react-icons/lu";
import { reportRendererError } from "renderer/lib/report-renderer-error";
import { WindowChrome } from "renderer/routes/_authenticated/_dashboard/components/WindowChrome";
import { getV2NotificationSourcesForTab } from "renderer/stores/v2-notifications";
import type { StoreApi } from "zustand/vanilla";
import { renderBrowserTabIcon } from "../../hooks/usePaneRegistry/components/BrowserPane";
import type { PaneViewerData } from "../../types";
import { V2NotificationStatusIndicator } from "../V2NotificationStatusIndicator";
import { RightPaneAddMenu } from "./components/RightPaneAddMenu";
import { RightPaneEmptyState } from "./components/RightPaneEmptyState";
import { RightPaneHeaderButton } from "./components/RightPaneHeaderButton";
import type { RightPaneGates } from "./paneOptions";
import type { RightPaneKind } from "./types";

const RIGHT_PANE_KEPT_TABS = 2;

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
	onAdd: (kind: RightPaneKind) => void;
	gates: RightPaneGates;
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
	onAdd,
	gates,
}: RightPaneAreaProps) {
	const { t } = useLingui();
	useEffect(() => {
		if (!isFullScreen) return;
		const active = store.getState().getActivePane();
		if (active) store.getState().focusPane(active.pane.id);
	}, [isFullScreen, store]);

	return (
		<div className="contents" data-pane-area="right">
			<Workspace<PaneViewerData>
				keepAliveTabs={RIGHT_PANE_KEPT_TABS}
				registry={registry}
				paneActions={paneActions}
				contextMenuActions={contextMenuActions}
				onPaneError={reportRendererError}
				renderTabIcon={renderBrowserTabIcon}
				renderTabAccessory={(tab) => (
					<V2NotificationStatusIndicator
						sources={getV2NotificationSourcesForTab(tab)}
					/>
				)}
				renderTabBarLeading={isFullScreen ? () => <WindowChrome /> : undefined}
				renderAddTabMenu={({ runAfterClose }) => (
					<RightPaneAddMenu
						onAdd={onAdd}
						runAfterClose={runAfterClose}
						gates={gates}
					/>
				)}
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
				renderEmptyState={() => (
					<RightPaneEmptyState onAdd={onAdd} gates={gates} />
				)}
				onBeforeCloseTab={onBeforeCloseTab}
				onInteractionStateChange={onInteractionStateChange}
				store={store}
			/>
		</div>
	);
}
