import { Trans, useLingui } from "@lingui/react/macro";
import { formatCompactRelativeTime } from "@superset/i18n/format";
import type { RendererContext, WorkspaceStore } from "@superset/panes";
import {
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import { Check, LoaderCircle, Search } from "lucide-react";
import type {
	ChatPaneData,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type { StoreApi } from "zustand/vanilla";
import type {
	SurfaceForkPlacement,
	SurfaceForkSource,
} from "../../../../hooks/useSurfaceFork";
import { useSurfaceForkSource } from "../../../../hooks/useSurfaceForkSource";
import { AccountUsage } from "../../../AccountUsage";
import { SurfaceForkMenuItems } from "../../../SurfaceForkMenuItems";
import { useChatHistory } from "../../hooks/useChatHistory";

const RECENT_CHAT_COUNT = 5;

export function ChatTitleMenu({
	context,
	workspaceId,
	linkedStores,
	onFork,
	onSearchAll,
	onNavigate,
}: {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
	linkedStores: StoreApi<WorkspaceStore<PaneViewerData>>[];
	onFork: (source: SurfaceForkSource, placement: SurfaceForkPlacement) => void;
	onSearchAll: () => void;
	onNavigate: () => void;
}) {
	const { t } = useLingui();
	const data = context.pane.data as ChatPaneData;
	const {
		saved,
		native,
		agentSessions,
		currentAgentSessionId,
		entries,
		isCurrent,
		openChat,
		openAgentSession,
	} = useChatHistory({ context, workspaceId, linkedStores, enabled: true });
	const surfaceFork = useSurfaceForkSource(workspaceId, { kind: "chat", data });
	const recent = [
		...entries.map((entry) => ({
			key: entry.key,
			title: entry.title || t({ message: "Untitled chat" }),
			updatedAt: entry.updatedAt,
			current: isCurrent(entry),
			open: () => openChat(entry),
		})),
		...agentSessions.map((session) => ({
			key: `agent:${session.sessionId}`,
			title: session.agentName,
			updatedAt: new Date(session.lastActivityAt).getTime(),
			current: currentAgentSessionId === session.sessionId,
			open: () => openAgentSession(session),
		})),
	]
		.sort((a, b) => b.updatedAt - a.updatedAt)
		.slice(0, RECENT_CHAT_COUNT);
	const failed = saved.isError || native.isError;

	return (
		<>
			<DropdownMenuLabel className="text-xs text-muted-foreground">
				<Trans>Recent chats</Trans>
			</DropdownMenuLabel>
			{saved.isPending && recent.length === 0 ? (
				<div className="flex justify-center p-2">
					<LoaderCircle
						className="size-4 animate-spin text-muted-foreground"
						aria-label={t({ message: "Loading" })}
					/>
				</div>
			) : null}
			{failed ? (
				<p className="px-2 py-1.5 text-xs text-muted-foreground">
					<Trans>Some chat history could not be loaded.</Trans>
				</p>
			) : !saved.isPending && recent.length === 0 ? (
				<p className="px-2 py-1.5 text-xs text-muted-foreground">
					<Trans>No chats found</Trans>
				</p>
			) : null}
			{recent.map((chat) => (
				<DropdownMenuItem
					key={chat.key}
					onSelect={() => {
						onNavigate();
						chat.open();
					}}
				>
					<span className="w-4 shrink-0">
						{chat.current && <Check className="size-3.5" />}
					</span>
					<span className="min-w-0 flex-1 truncate">{chat.title}</span>
					{chat.updatedAt > 0 ? (
						<span className="shrink-0 text-xs text-muted-foreground">
							{formatCompactRelativeTime(chat.updatedAt)}
						</span>
					) : null}
				</DropdownMenuItem>
			))}
			<DropdownMenuItem onSelect={onSearchAll}>
				<Search />
				<Trans>Search all chats…</Trans>
			</DropdownMenuItem>
			<AccountUsage workspaceId={workspaceId} terminalId={data.terminalId} />
			{surfaceFork.enabled && surfaceFork.source ? (
				<>
					<DropdownMenuSeparator />
					<SurfaceForkMenuItems
						target="cli"
						source={surfaceFork.source}
						onFork={(source, placement) => {
							onNavigate();
							onFork(source, placement);
						}}
					/>
				</>
			) : null}
		</>
	);
}
