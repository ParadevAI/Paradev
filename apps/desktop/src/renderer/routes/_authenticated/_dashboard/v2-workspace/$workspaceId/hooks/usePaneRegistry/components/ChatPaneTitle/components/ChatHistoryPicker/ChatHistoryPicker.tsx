import { Trans, useLingui } from "@lingui/react/macro";
import { formatCompactRelativeTime } from "@superset/i18n/format";
import type { RendererContext, WorkspaceStore } from "@superset/panes";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@superset/ui/popover";
import { Check, LoaderCircle } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type { StoreApi } from "zustand/vanilla";
import { onOpenChatHistory } from "../../../../utils/chatHistoryOpen";
import { useChatHistory } from "../../hooks/useChatHistory";

interface ChatHistoryPickerProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
	linkedStores: StoreApi<WorkspaceStore<PaneViewerData>>[];
	children: ReactNode;
}

export function ChatHistoryPicker({
	context,
	workspaceId,
	linkedStores,
	children,
}: ChatHistoryPickerProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const paneId = context.pane.id;
	// "Search all chats…" in the title menu and the composer's `/resume` both open this.
	useEffect(
		() =>
			onOpenChatHistory(paneId, () => {
				setSearch("");
				setOpen(true);
			}),
		[paneId],
	);
	const {
		saved,
		native,
		agentSessions,
		currentAgentSessionId,
		entries,
		isCurrent,
		openChat,
		openAgentSession,
	} = useChatHistory({ context, workspaceId, linkedStores, enabled: open });
	const query = search.toLowerCase();
	const visibleAgentSessions = agentSessions.filter((session) =>
		session.agentName.toLowerCase().includes(query),
	);
	const visible = entries.filter((entry) =>
		`${entry.title ?? ""} ${entry.key}`.toLowerCase().includes(query),
	);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverAnchor asChild>
				<div className="flex min-w-0 items-center gap-1.5">{children}</div>
			</PopoverAnchor>
			<PopoverContent
				align="start"
				className="w-80 p-2"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="pb-2 text-sm font-medium">
					<Trans>Chat history</Trans>
				</div>
				<Input
					className="h-8"
					placeholder={t({ message: "Search chats..." })}
					aria-label={t({ message: "Search chats..." })}
					value={search}
					onChange={(event) => setSearch(event.target.value)}
				/>
				<div className="mt-2 max-h-72 overflow-y-auto">
					{saved.isPending || native.isFetching ? (
						<div className="flex justify-center p-2">
							<LoaderCircle
								className="size-4 animate-spin"
								aria-label={t({ message: "Loading" })}
							/>
						</div>
					) : null}
					{saved.isError || native.isError ? (
						<div className="p-2 text-xs text-muted-foreground">
							<Trans>Some chat history could not be loaded.</Trans>
							<Button
								variant="link"
								size="sm"
								onClick={() => {
									void saved.refetch();
									void native.refetch();
								}}
							>
								<Trans>Retry</Trans>
							</Button>
						</div>
					) : null}
					{native.data?.pages[0]?.supported === false ? (
						<p className="p-2 text-xs text-muted-foreground">
							<Trans>This agent only shows chats saved in Paradev.</Trans>
						</p>
					) : null}
					{visibleAgentSessions.length > 0 ? (
						<>
							<div className="px-2 pt-1 pb-1 text-xs text-muted-foreground">
								<Trans>Agents</Trans>
							</div>
							{visibleAgentSessions.map((session) => (
								<button
									type="button"
									key={session.sessionId}
									className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
									onClick={() => {
										setOpen(false);
										openAgentSession(session);
									}}
								>
									<div className="min-w-0 flex-1">
										<div className="truncate text-sm">{session.agentName}</div>
										<div className="text-xs text-muted-foreground">
											{formatCompactRelativeTime(
												new Date(session.lastActivityAt).getTime(),
											)}
										</div>
									</div>
									{currentAgentSessionId === session.sessionId ? (
										<Check className="size-3.5 shrink-0" />
									) : null}
								</button>
							))}
						</>
					) : null}
					{visible.map((entry) => (
						<button
							type="button"
							key={entry.key}
							className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
							onClick={() => {
								setOpen(false);
								openChat(entry);
							}}
						>
							<div className="min-w-0 flex-1">
								<div className="truncate text-sm">
									{entry.title || t({ message: "Untitled chat" })}
								</div>
								{entry.updatedAt > 0 ? (
									<div className="text-xs text-muted-foreground">
										{formatCompactRelativeTime(entry.updatedAt)}
									</div>
								) : null}
							</div>
							{isCurrent(entry) ? (
								<Check className="size-3.5 shrink-0" />
							) : null}
						</button>
					))}
					{!saved.isPending &&
					!native.isFetching &&
					visible.length === 0 &&
					visibleAgentSessions.length === 0 ? (
						<p className="p-3 text-center text-sm text-muted-foreground">
							<Trans>No chats found</Trans>
						</p>
					) : null}
					{native.hasNextPage ? (
						<Button
							variant="ghost"
							size="sm"
							className="w-full"
							disabled={native.isFetchingNextPage}
							onClick={() => void native.fetchNextPage()}
						>
							<Trans>Load more</Trans>
						</Button>
					) : null}
				</div>
			</PopoverContent>
		</Popover>
	);
}
