import { useLingui } from "@lingui/react/macro";
import type { RendererContext, WorkspaceStore } from "@superset/panes";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { ChevronDown } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import type {
	ChatPaneData,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type { StoreApi } from "zustand/vanilla";
import type {
	SurfaceForkPlacement,
	SurfaceForkSource,
} from "../../hooks/useSurfaceFork";
import {
	type SubagentCrumb,
	useChatSubagentStore,
} from "../../stores/chatSubagentStore";
import { openChatHistory } from "../../utils/chatHistoryOpen";
import { AccountUsageDot } from "../AccountUsageDot";
import { ChatHistoryPicker } from "./components/ChatHistoryPicker";
import { ChatTitleMenu } from "./components/ChatTitleMenu";
import { SubagentBreadcrumb } from "./components/SubagentBreadcrumb";

const NO_PATH: readonly SubagentCrumb[] = [];

export function ChatPaneTitle({
	context,
	workspaceId,
	linkedStores,
	icon,
	title,
	onFork,
}: {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
	linkedStores: StoreApi<WorkspaceStore<PaneViewerData>>[];
	icon: ReactNode;
	title: string;
	onFork: (source: SurfaceForkSource, placement: SurfaceForkPlacement) => void;
}) {
	const { t } = useLingui();
	const { terminalId: chatKey } = context.pane.data as ChatPaneData;
	const paneId = context.pane.id;
	const path = useChatSubagentStore((state) => state.paths[chatKey] ?? NO_PATH);
	const open = useChatSubagentStore((state) => state.open);
	const [menuOpen, setMenuOpen] = useState(false);
	const searchRequested = useRef(false);
	const menuLabel = t({ message: "Chat menu" });
	const usageDot = (
		<AccountUsageDot workspaceId={workspaceId} terminalId={chatKey} />
	);

	const withMenu = (trigger: ReactNode) => (
		<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
			<DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="w-72"
				onClick={(event) => event.stopPropagation()}
				onCloseAutoFocus={(event) => {
					if (!searchRequested.current) return;
					searchRequested.current = false;
					event.preventDefault();
					openChatHistory(paneId);
				}}
			>
				<ChatTitleMenu
					context={context}
					workspaceId={workspaceId}
					linkedStores={linkedStores}
					onFork={onFork}
					onSearchAll={() => {
						searchRequested.current = true;
					}}
				/>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	return (
		<ChatHistoryPicker
			context={context}
			workspaceId={workspaceId}
			linkedStores={linkedStores}
		>
			{path.length > 0 ? (
				<>
					<span className="shrink-0 text-muted-foreground">{icon}</span>
					<SubagentBreadcrumb
						onSelect={(id) => open(chatKey, id)}
						path={path}
						root={title}
						rootMenu={withMenu(
							<button
								type="button"
								aria-label={menuLabel}
								className="flex shrink-0 items-center gap-1 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							>
								{usageDot}
								<ChevronDown className="size-3" />
							</button>,
						)}
					/>
				</>
			) : (
				withMenu(
					<button
						type="button"
						aria-label={menuLabel}
						title={title}
						className={cn(
							"flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-xs transition-colors hover:bg-muted hover:text-foreground",
							context.isActive ? "text-foreground" : "text-muted-foreground",
						)}
						onClick={(event) => event.stopPropagation()}
					>
						<span className="shrink-0 text-muted-foreground">{icon}</span>
						<span className="min-w-0 truncate">{title}</span>
						{usageDot}
						<ChevronDown className="size-3 shrink-0 text-muted-foreground" />
					</button>,
				)
			)}
		</ChatHistoryPicker>
	);
}
