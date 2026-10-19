import { Trans, useLingui } from "@lingui/react/macro";
import { acpHarnessForPreset } from "@superset/chat/core";
import { formatCompactRelativeTime } from "@superset/i18n/format";
import type { RendererContext, WorkspaceStore } from "@superset/panes";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useWorkspaceClient } from "@superset/workspace-client";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Check, History, LoaderCircle } from "lucide-react";
import { useState } from "react";
import type {
	ChatPaneData,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { reopenChatSession } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/closedChatSessions";
import { removePendingChatStop } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/pendingChatStops";
import type { StoreApi } from "zustand/vanilla";
import { useChatWiring } from "../../../ChatSession/hooks/useSessionClient";
import { type HistoryEntry, historyEntries } from "./utils/historyEntries";

interface ChatHistoryPickerProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
	linkedStores?: StoreApi<WorkspaceStore<PaneViewerData>>[];
}

export function ChatHistoryPicker({
	context,
	workspaceId,
	linkedStores = [],
}: ChatHistoryPickerProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const current = context.pane.data as ChatPaneData;
	const { hostUrl } = useWorkspaceClient();
	const { transport } = useChatWiring();
	const harness = acpHarnessForPreset(current.agent?.id);
	const saved = useQuery({
		queryKey: ["chat-v3", hostUrl, "history", workspaceId],
		queryFn: () => transport.listSessions({ workspaceId, limit: 200 }),
		enabled: open,
		refetchOnWindowFocus: false,
	});
	const native = useInfiniteQuery({
		queryKey: ["chat-v3", hostUrl, "discoverSessions", workspaceId, harness],
		queryFn: ({ pageParam }) =>
			transport.discoverSessions({
				workspaceId,
				harness: harness ?? "",
				...(pageParam ? { cursor: pageParam } : {}),
			}),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (page) => page.nextCursor,
		enabled: open && !!harness,
		retry: false,
		refetchOnWindowFocus: false,
	});
	const entries = historyEntries(
		saved.data ?? [],
		native.data?.pages.flatMap((page) => page.sessions) ?? [],
		harness ?? "",
	);
	const visible = entries.filter((entry) =>
		`${entry.title ?? ""} ${entry.key}`
			.toLowerCase()
			.includes(search.toLowerCase()),
	);
	const isCurrent = (entry: HistoryEntry) =>
		(entry.sessionId !== null && entry.sessionId === current.sessionId) ||
		(entry.presetId === current.agent?.id &&
			entry.harnessSessionId !== undefined &&
			entry.harnessSessionId === current.agent?.sessionId);

	const openChat = (entry: HistoryEntry) => {
		setOpen(false);
		for (const store of [context.store, ...linkedStores]) {
			for (const tab of store.getState().tabs) {
				const pane = Object.values(tab.panes).find((pane) => {
					if (pane.kind !== "chat-v3") return false;
					const data = pane.data as ChatPaneData;
					return (
						(entry.sessionId !== null && data.sessionId === entry.sessionId) ||
						(data.agent?.id === entry.presetId &&
							entry.harnessSessionId !== undefined &&
							data.agent?.sessionId === entry.harnessSessionId)
					);
				});
				if (pane) {
					store.getState().setActiveTab(tab.id);
					store.getState().setActivePane({ tabId: tab.id, paneId: pane.id });
					return;
				}
			}
		}
		if (entry.sessionId) {
			reopenChatSession(entry.sessionId);
			removePendingChatStop(entry.sessionId);
		}
		context.store.getState().addTab({
			panes: [
				{
					kind: "chat-v3",
					data: {
						terminalId: entry.terminalId ?? crypto.randomUUID(),
						sessionId: entry.sessionId,
						agent: {
							id: entry.presetId,
							...(entry.harnessSessionId
								? { sessionId: entry.harnessSessionId }
								: {}),
						},
						...(entry.title ? { chatTitle: entry.title } : {}),
					} satisfies ChatPaneData,
				},
			],
		});
	};

	return (
		<Popover
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen);
				if (nextOpen) setSearch("");
			}}
		>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-6"
					aria-label={t({ message: "Chat history" })}
					title={t({ message: "Chat history" })}
					onClick={(event) => event.stopPropagation()}
				>
					<History className="size-3.5" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
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
							<Trans>This agent only shows chats saved in Superset.</Trans>
						</p>
					) : null}
					{visible.map((entry) => (
						<button
							type="button"
							key={entry.key}
							className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
							onClick={() => openChat(entry)}
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
					{!saved.isPending && !native.isFetching && visible.length === 0 ? (
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
