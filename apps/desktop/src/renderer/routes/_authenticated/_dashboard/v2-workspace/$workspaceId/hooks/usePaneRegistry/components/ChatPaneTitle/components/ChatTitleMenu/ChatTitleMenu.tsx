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
}: {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
	linkedStores: StoreApi<WorkspaceStore<PaneViewerData>>[];
	onFork: (source: SurfaceForkSource, placement: SurfaceForkPlacement) => void;
	onSearchAll: () => void;
}) {
	const { t } = useLingui();
	const data = context.pane.data as ChatPaneData;
	const { saved, entries, isCurrent, openChat } = useChatHistory({
		context,
		workspaceId,
		linkedStores,
		enabled: true,
	});
	const surfaceFork = useSurfaceForkSource(workspaceId, { kind: "chat", data });
	const recent = entries.slice(0, RECENT_CHAT_COUNT);

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
			{recent.map((entry) => (
				<DropdownMenuItem key={entry.key} onSelect={() => openChat(entry)}>
					<span className="w-4 shrink-0">
						{isCurrent(entry) && <Check className="size-3.5" />}
					</span>
					<span className="min-w-0 flex-1 truncate">
						{entry.title || t({ message: "Untitled chat" })}
					</span>
					{entry.updatedAt > 0 ? (
						<span className="shrink-0 text-xs text-muted-foreground">
							{formatCompactRelativeTime(entry.updatedAt)}
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
						onFork={onFork}
					/>
				</>
			) : null}
		</>
	);
}
