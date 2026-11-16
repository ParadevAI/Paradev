import { Trans, useLingui } from "@lingui/react/macro";
import { formatCompactRelativeTime } from "@superset/i18n/format";
import type { WorkspaceStore } from "@superset/panes";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@superset/ui/popover";
import { Check, LoaderCircle } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import type {
	ChatPaneData,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type { StoreApi } from "zustand/vanilla";
import { StopHeaderEvents } from "../../../StopHeaderEvents";
import { useChatHistory } from "../../hooks/useChatHistory";

interface ChatHistoryPickerProps {
	current: ChatPaneData;
	workspaceId: string;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	linkedStores?: StoreApi<WorkspaceStore<PaneViewerData>>[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: ReactNode;
}

export function ChatHistoryPicker({
	current,
	workspaceId,
	store,
	linkedStores,
	open,
	onOpenChange,
	children,
}: ChatHistoryPickerProps) {
	const { t } = useLingui();
	const [search, setSearch] = useState("");
	useEffect(() => {
		if (open) setSearch("");
	}, [open]);
	const {
		saved,
		native,
		entries,
		agentSessions,
		isCurrent,
		openEntry,
		openAgentSession,
	} = useChatHistory({
		workspaceId,
		current,
		store,
		linkedStores,
		enabled: open,
	});
	const visibleAgentSessions = agentSessions.filter((session) =>
		session.agentName.toLowerCase().includes(search.toLowerCase()),
	);
	const visible = entries.filter((entry) =>
		`${entry.title ?? ""} ${entry.key}`
			.toLowerCase()
			.includes(search.toLowerCase()),
	);

	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverAnchor asChild>
				<div className="flex min-w-0 items-center gap-1.5">{children}</div>
			</PopoverAnchor>
			<StopHeaderEvents>
				<PopoverContent align="start" className="w-80 p-2">
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
											onOpenChange(false);
											openAgentSession(session);
										}}
									>
										<div className="min-w-0 flex-1">
											<div className="truncate text-sm">
												{session.agentName}
											</div>
											<div className="text-xs text-muted-foreground">
												{formatCompactRelativeTime(
													new Date(session.lastActivityAt).getTime(),
												)}
											</div>
										</div>
										{current.agentSession?.id === session.sessionId ? (
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
									onOpenChange(false);
									openEntry(entry);
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
			</StopHeaderEvents>
		</Popover>
	);
}
