import { Trans, useLingui } from "@lingui/react/macro";
import { ContextMenuItem } from "@superset/ui/context-menu";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import {
	LuExternalLink,
	LuMaximize2,
	LuMessageSquareText,
	LuMinimize2,
	LuPanelRightClose,
	LuPlus,
	LuSquareCheck,
	LuUser,
} from "react-icons/lu";
import { useHotkey } from "renderer/hotkeys";
import { RightPaneHeaderButton } from "renderer/routes/_authenticated/_dashboard/components/RightPaneHeaderButton";
import { WindowChrome } from "renderer/routes/_authenticated/_dashboard/components/WindowChrome";
import { WindowControlsInset } from "renderer/routes/_authenticated/_dashboard/components/WindowControlsInset";
import type { ChannelMessage } from "renderer/routes/_authenticated/utils/channelMessageCache";
import {
	type ChannelPanelTab,
	panelTabKey,
	useChannelPanelStore,
} from "../../stores/channelPanelStore";
import type { ChannelPerson } from "../ChannelMessageRow";
import { TaskPane } from "../TaskPane";
import { NewTabPage } from "./components/NewTabPage";
import { type PanelTabEntry, PanelTabStrip } from "./components/PanelTabStrip";
import { ProfilePane } from "./components/ProfilePane";
import { TabPreviewContent } from "./components/TabPreviewContent";
import { TaskTabPreview } from "./components/TaskTabPreview";
import { ThreadPane } from "./components/ThreadPane";
import { ThreadTabPreview } from "./components/ThreadTabPreview";
import { useFocusWithin } from "./hooks/useFocusWithin";

const EMPTY_TABS: ChannelPanelTab[] = [];

interface ChannelPanelProps {
	channelId: string;
	isFullScreen: boolean;
	onToggleFullScreen: () => void;
	onHide: () => void;
	onOpenThread: (message: ChannelMessage, replaceKey?: string) => void;
	onOpenTask: (
		task: { id: string; label: string },
		replaceKey?: string,
	) => void;
	peopleById: Map<string, ChannelPerson>;
	people: ChannelPerson[];
	currentUserId: string | null;
	canModerate: boolean;
	canPost: boolean;
	now: Date;
}

function tabIcon(tab: ChannelPanelTab) {
	if (tab.kind === "thread") return <LuMessageSquareText />;
	if (tab.kind === "task") return <LuSquareCheck />;
	if (tab.kind === "profile") return <LuUser />;
	return <LuPlus />;
}

export function ChannelPanel({
	channelId,
	isFullScreen,
	onToggleFullScreen,
	onHide,
	onOpenThread,
	onOpenTask,
	peopleById,
	...paneProps
}: ChannelPanelProps) {
	const { t } = useLingui();
	const tabs = useChannelPanelStore(
		(state) => state.panels[channelId]?.tabs ?? EMPTY_TABS,
	);
	const activeKey = useChannelPanelStore(
		(state) => state.panels[channelId]?.activeKey ?? null,
	);
	const activate = useChannelPanelStore((state) => state.activate);
	const close = useChannelPanelStore((state) => state.close);
	const closeOthers = useChannelPanelStore((state) => state.closeOthers);
	const closeToRight = useChannelPanelStore((state) => state.closeToRight);
	const navigate = useNavigate();
	const openNewTab = useChannelPanelStore((state) => state.openNewTab);
	const active = tabs.find((tab) => panelTabKey(tab) === activeKey) ?? tabs[0];
	const newTabLabel = t({ message: "New tab" });
	const focus = useFocusWithin();
	useHotkey(
		"CLOSE_PANE",
		() => {
			if (active) close(channelId, panelTabKey(active));
		},
		{ ignoreEventWhen: () => !focus.isWithin() },
	);

	const entries = useMemo<PanelTabEntry[]>(
		() =>
			tabs.map((tab) => ({
				key: panelTabKey(tab),
				label: tab.kind === "new-tab" ? newTabLabel : tab.label,
				icon: tabIcon(tab),
				menuItems:
					tab.kind === "task" ? (
						<ContextMenuItem
							onSelect={() =>
								void navigate({
									to: "/tasks/$taskId",
									params: { taskId: tab.id },
								})
							}
						>
							<LuExternalLink />
							<Trans>Open in Tasks</Trans>
						</ContextMenuItem>
					) : undefined,
			})),
		[tabs, newTabLabel, navigate],
	);
	const byKey = useMemo(
		() => new Map(tabs.map((tab) => [panelTabKey(tab), tab])),
		[tabs],
	);

	return (
		<div
			ref={focus.ref}
			className="flex h-full w-full min-w-0 flex-col bg-background"
		>
			<PanelTabStrip
				tabs={entries}
				activeKey={active ? panelTabKey(active) : null}
				onActivate={(key) => activate(channelId, key)}
				onClose={(key) => close(channelId, key)}
				onCloseOthers={(key) => closeOthers(channelId, key)}
				onCloseToRight={(key) => closeToRight(channelId, key)}
				onNewTab={() => openNewTab(channelId)}
				leading={isFullScreen ? <WindowChrome /> : undefined}
				renderPreview={(key) => {
					const tab = byKey.get(key);
					if (tab?.kind === "thread") {
						return (
							<ThreadTabPreview
								messageId={tab.id}
								label={tab.label}
								peopleById={peopleById}
							/>
						);
					}
					if (tab?.kind === "task") {
						return <TaskTabPreview taskId={tab.id} label={tab.label} />;
					}
					if (tab?.kind === "profile") {
						return <TabPreviewContent title={tab.label} icon={<LuUser />} />;
					}
					return <TabPreviewContent title={newTabLabel} icon={<LuPlus />} />;
				}}
				trailing={
					<div className="flex shrink-0 items-center gap-1 pr-2">
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
						<RightPaneHeaderButton
							label={t({ message: "Hide panel" })}
							hotkeyId="TOGGLE_SIDEBAR"
							onClick={onHide}
						>
							<LuPanelRightClose className="size-4" strokeWidth={1.5} />
						</RightPaneHeaderButton>
						<WindowControlsInset />
					</div>
				}
			/>
			{active?.kind === "thread" && (
				<ThreadPane
					key={active.id}
					channelId={channelId}
					messageId={active.id}
					peopleById={peopleById}
					{...paneProps}
				/>
			)}
			{active?.kind === "task" && (
				<TaskPane
					key={active.id}
					taskId={active.id}
					onClose={() => close(channelId, panelTabKey(active))}
				/>
			)}
			{active?.kind === "profile" && (
				<ProfilePane
					key={active.id}
					userId={active.id}
					isSelf={active.id === paneProps.currentUserId}
				/>
			)}
			{active?.kind === "new-tab" && (
				<NewTabPage
					key={channelId}
					channelId={channelId}
					onOpenThread={(message) => onOpenThread(message, panelTabKey(active))}
					onOpenTask={(task) => onOpenTask(task, panelTabKey(active))}
				/>
			)}
		</div>
	);
}
