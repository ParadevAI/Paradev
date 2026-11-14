import { Trans, useLingui } from "@lingui/react/macro";
import type { RendererContext, WorkspaceStore } from "@superset/panes";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { ArrowLeft, ChevronDown, Pencil, Plus, Search } from "lucide-react";
import {
	type MouseEvent,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import { RenameDialog } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/RenameDialog";
import type {
	ChatPaneData,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type { StoreApi } from "zustand/vanilla";
import type { SurfaceForkSource } from "../../hooks/useSurfaceFork";
import { useSurfaceForkSource } from "../../hooks/useSurfaceForkSource";
import {
	type SubagentCrumb,
	useChatSubagentStore,
} from "../../stores/chatSubagentStore";
import { onOpenChatHistory } from "../../utils/chatHistoryOpen";
import { AccountUsageMenuSection } from "../AccountUsageMenuSection";
import { ForkMenuItems } from "../ForkMenuItems";
import { StopHeaderEvents } from "../StopHeaderEvents";
import { UsageWarningDot } from "../UsageWarningDot";
import { ChatHistoryPicker } from "./components/ChatHistoryPicker";
import { RecentChatsMenuItems } from "./components/RecentChatsMenuItems";
import { SubagentBreadcrumb } from "./components/SubagentBreadcrumb";
import { useForkChatIntoChat } from "./hooks/useForkChatIntoChat";

const NO_PATH: readonly SubagentCrumb[] = [];

type AfterMenuClose = "history" | "rename";

function stopHeaderClick(event: MouseEvent) {
	event.stopPropagation();
}

export function ChatPaneTitle({
	context,
	workspaceId,
	linkedStores,
	icon,
	onForkIntoOtherSurface,
}: {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
	linkedStores?: StoreApi<WorkspaceStore<PaneViewerData>>[];
	icon: ReactNode;
	onForkIntoOtherSurface: (source: SurfaceForkSource) => void;
}) {
	const { t } = useLingui();
	const data = context.pane.data as ChatPaneData;
	const chatKey = data.terminalId;
	const paneId = context.pane.id;
	const chatName = context.pane.titleOverride ?? data.chatTitle;
	const title = chatName ?? t({ message: "Chat" });
	const path = useChatSubagentStore((state) => state.paths[chatKey] ?? NO_PATH);
	const openSubagent = useChatSubagentStore((state) => state.open);
	const [menuOpen, setMenuOpen] = useState(false);
	const [historyOpen, setHistoryOpen] = useState(false);
	const [renaming, setRenaming] = useState(false);
	// The menu's focus return would close a popover opened from it, so the
	// history search waits for the menu to close; rename follows the same path.
	const afterMenuClose = useRef<AfterMenuClose | null>(null);
	const forkSource = useSurfaceForkSource(workspaceId, { kind: "chat", data });
	const forkIntoChat = useForkChatIntoChat(context, workspaceId);
	const agentId = data.agent?.id;

	useEffect(
		() => onOpenChatHistory(paneId, () => setHistoryOpen(true)),
		[paneId],
	);

	const newChat = () => {
		if (!agentId) return;
		context.store.getState().addTab({
			panes: [
				{
					kind: "chat-v3",
					data: {
						terminalId: crypto.randomUUID(),
						sessionId: null,
						agent: { id: agentId },
					} satisfies ChatPaneData,
				},
			],
		});
	};

	const rename = (name: string) => {
		const trimmed = name.trim();
		if (trimmed) {
			context.actions.setTitle(trimmed);
			return;
		}
		context.store.getState().setPaneTitleOverride({
			tabId: context.tab.id,
			paneId,
			titleOverride: undefined,
		});
	};

	const trigger = (
		<DropdownMenuTrigger asChild>
			<button
				type="button"
				title={title}
				className={cn(
					"flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-xs transition-colors hover:bg-muted hover:text-foreground",
					path.length > 0 && "shrink-0",
					context.isActive && path.length === 0
						? "text-foreground"
						: "text-muted-foreground",
				)}
				onClick={stopHeaderClick}
			>
				<span className="truncate">{title}</span>
				<ChevronDown className="size-3 shrink-0 opacity-60" />
				<UsageWarningDot workspaceId={workspaceId} terminalId={chatKey} />
			</button>
		</DropdownMenuTrigger>
	);

	return (
		<>
			<span className="shrink-0 text-muted-foreground">{icon}</span>
			<ChatHistoryPicker
				current={data}
				workspaceId={workspaceId}
				store={context.store}
				linkedStores={linkedStores}
				open={historyOpen}
				onOpenChange={setHistoryOpen}
			>
				<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
					{path.length > 0 ? (
						<SubagentBreadcrumb
							onSelect={(id) => openSubagent(chatKey, id)}
							path={path}
							root={trigger}
						/>
					) : (
						trigger
					)}
					<StopHeaderEvents>
						<DropdownMenuContent
							align="start"
							className="w-72"
							onCloseAutoFocus={(event) => {
								const next = afterMenuClose.current;
								if (!next) return;
								afterMenuClose.current = null;
								event.preventDefault();
								if (next === "history") setHistoryOpen(true);
								else setRenaming(true);
							}}
						>
							{path.length > 0 && (
								<>
									<DropdownMenuItem
										onSelect={() => openSubagent(chatKey, null)}
									>
										<ArrowLeft />
										<Trans>Back to main chat</Trans>
									</DropdownMenuItem>
									<DropdownMenuSeparator />
								</>
							)}
							{agentId && (
								<DropdownMenuItem onSelect={newChat}>
									<Plus />
									<Trans>New chat</Trans>
								</DropdownMenuItem>
							)}
							<DropdownMenuItem
								onSelect={() => {
									afterMenuClose.current = "rename";
								}}
							>
								<Pencil />
								<Trans>Rename chat</Trans>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<RecentChatsMenuItems
								current={data}
								workspaceId={workspaceId}
								store={context.store}
								linkedStores={linkedStores}
								enabled={menuOpen}
							/>
							<DropdownMenuItem
								onSelect={() => {
									afterMenuClose.current = "history";
								}}
							>
								<Search />
								<Trans>Search all chats…</Trans>
							</DropdownMenuItem>
							<AccountUsageMenuSection
								workspaceId={workspaceId}
								terminalId={chatKey}
							/>
							{(forkSource || forkIntoChat) && (
								<>
									<DropdownMenuSeparator />
									<ForkMenuItems
										onForkIntoCli={
											forkSource
												? () => onForkIntoOtherSurface(forkSource)
												: undefined
										}
										onForkIntoChat={forkIntoChat}
									/>
								</>
							)}
						</DropdownMenuContent>
					</StopHeaderEvents>
				</DropdownMenu>
			</ChatHistoryPicker>
			{renaming && (
				<StopHeaderEvents>
					<RenameDialog
						name={chatName ?? ""}
						title={t({ message: "Rename chat" })}
						description={t({
							message: "Leave it empty to go back to the default name.",
						})}
						inputLabel={t({ message: "Chat name" })}
						onClose={() => setRenaming(false)}
						onSubmit={rename}
					/>
				</StopHeaderEvents>
			)}
		</>
	);
}
