import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useRouter } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useOpenNewWorkspace } from "renderer/hooks/useOpenNewWorkspace";
import { useZoomFactor } from "renderer/hooks/useZoomFactor";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	useWindowTabsStore,
	type WindowTab as WindowTabModel,
} from "renderer/stores/window-tabs";
import { AppMenuButton } from "../AppMenuButton";
import { NavigationControls } from "../NavigationControls";
import { NAVIGATION_RAIL_WIDTH } from "../NavigationRail";
import { OfflineBadge } from "../OfflineBadge";
import { PortsDropdown } from "../PortsDropdown";
import { SidebarToggle } from "../SidebarToggle";
import { WindowControlsInset } from "../WindowControlsInset";
import { WindowTab } from "./components/WindowTab";
import { useSyncWindowTabs } from "./hooks/useSyncWindowTabs";
import { useWindowTabTitles } from "./hooks/useWindowTabTitles";

/** macOS draws the window buttons in the first 80 physical pixels, whatever the page zoom. */
const TRAFFIC_LIGHTS_WIDTH = 80;

/** The window's top row: window controls, history, one tab per open screen, and window-wide actions. */
export function WindowTabBar() {
	useSyncWindowTabs();
	const { t } = useLingui();
	const router = useRouter();
	const tabs = useWindowTabsStore((state) => state.tabs);
	const activeTabId = useWindowTabsStore((state) => state.activeTabId);
	const closeTab = useWindowTabsStore((state) => state.close);
	const titles = useWindowTabTitles(tabs);
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === undefined || platform === "darwin";
	const zoomFactor = useZoomFactor();
	const openNewWorkspace = useOpenNewWorkspace();
	const newThreadShortcut = useHotkeyDisplay("NEW_WORKSPACE").text;

	const activate = (tab: WindowTabModel) => {
		void router.navigate({ href: tab.href });
	};
	const close = (tab: WindowTabModel) => {
		const { wasActive, next } = closeTab(tab.id);
		if (!wasActive) return;
		void (next
			? router.navigate({ href: next.href })
			: router.navigate({ to: "/new-workspace" }));
	};

	return (
		<div className="drag flex h-11 shrink-0 items-center gap-1 pr-2">
			{isMac ? (
				<div
					className="h-full shrink-0"
					style={{ width: TRAFFIC_LIGHTS_WIDTH / zoomFactor }}
				/>
			) : (
				<div
					className="flex shrink-0 justify-center"
					style={{ width: NAVIGATION_RAIL_WIDTH }}
				>
					<AppMenuButton />
				</div>
			)}
			<div className="no-drag flex shrink-0 items-center gap-0.5">
				<SidebarToggle />
				<NavigationControls />
			</div>
			<div className="no-drag hide-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto px-1">
				{tabs.map((tab) => (
					<WindowTab
						key={tab.id}
						tab={tab}
						title={titles.get(tab.id) ?? ""}
						isActive={tab.id === activeTabId}
						onActivate={() => activate(tab)}
						onClose={() => close(tab)}
					/>
				))}
			</div>
			<div className="h-full min-w-0 flex-1" />
			<div className="no-drag flex shrink-0 items-center gap-1">
				<PortsDropdown align="end" />
				<OfflineBadge />
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label={t({ message: "New thread" })}
							onClick={() => openNewWorkspace()}
							className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
						>
							<Plus className="size-4" strokeWidth={1.75} />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<Trans>New thread ({newThreadShortcut})</Trans>
					</TooltipContent>
				</Tooltip>
			</div>
			<WindowControlsInset />
		</div>
	);
}
