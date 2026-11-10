import { Trans, useLingui } from "@lingui/react/macro";
import { formatCompactRelativeTime } from "@superset/i18n/format";
import type { WorkspaceStore } from "@superset/panes";
import {
	DropdownMenuItem,
	DropdownMenuLabel,
} from "@superset/ui/dropdown-menu";
import { Check, LoaderCircle } from "lucide-react";
import type {
	ChatPaneData,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type { StoreApi } from "zustand/vanilla";
import { useChatHistory } from "../../hooks/useChatHistory";

const RECENT_CHAT_COUNT = 5;

export function RecentChatsMenuItems({
	current,
	workspaceId,
	store,
	linkedStores,
	enabled,
}: {
	current: ChatPaneData;
	workspaceId: string;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	linkedStores?: StoreApi<WorkspaceStore<PaneViewerData>>[];
	enabled: boolean;
}) {
	const { t } = useLingui();
	const { saved, entries, isCurrent, openEntry } = useChatHistory({
		workspaceId,
		current,
		store,
		linkedStores,
		enabled,
		recentOnly: true,
	});
	// Untitled entries are mostly the hidden sessions a terminal fork loads
	// through; the full search still lists them.
	const recent = entries
		.filter((entry) => entry.title || isCurrent(entry))
		.slice(0, RECENT_CHAT_COUNT);
	if (recent.length === 0 && !saved.isPending) return null;
	return (
		<>
			<DropdownMenuLabel className="flex items-center gap-2 font-normal text-muted-foreground text-xs">
				<Trans>Recent chats</Trans>
				{saved.isPending && (
					<LoaderCircle
						className="size-3 animate-spin"
						aria-label={t({ message: "Loading" })}
					/>
				)}
			</DropdownMenuLabel>
			{recent.map((entry) => (
				<DropdownMenuItem key={entry.key} onSelect={() => openEntry(entry)}>
					<span className="w-3.5 shrink-0">
						{isCurrent(entry) && <Check className="size-3.5" />}
					</span>
					<span className="min-w-0 flex-1 truncate">
						{entry.title || t({ message: "Untitled chat" })}
					</span>
					{entry.updatedAt > 0 && (
						<span className="shrink-0 text-muted-foreground text-xs">
							{formatCompactRelativeTime(entry.updatedAt)}
						</span>
					)}
				</DropdownMenuItem>
			))}
		</>
	);
}
