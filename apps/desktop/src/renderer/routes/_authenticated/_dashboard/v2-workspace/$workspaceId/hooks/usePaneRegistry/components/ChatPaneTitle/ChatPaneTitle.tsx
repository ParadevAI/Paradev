import { useLingui } from "@lingui/react/macro";
import type { RendererContext, WorkspaceStore } from "@superset/panes";
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
import {
	PaneTitleMenu,
	type PaneTitleMenuTriggerProps,
} from "../PaneTitleMenu";
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
	const closeIntent = useRef<"search" | "navigate" | null>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const usageDot = (
		<AccountUsageDot workspaceId={workspaceId} terminalId={chatKey} />
	);
	const withMenu = (
		renderTrigger: (props: PaneTitleMenuTriggerProps) => ReactNode,
	) => (
		<PaneTitleMenu
			open={menuOpen}
			onOpenChange={setMenuOpen}
			triggerRef={triggerRef}
			renderTrigger={renderTrigger}
			contentClassName="w-72"
			onCloseAutoFocus={(event) => {
				const intent = closeIntent.current;
				closeIntent.current = null;
				if (intent === null) return;
				event.preventDefault();
				if (intent === "search") openChatHistory(paneId);
			}}
		>
			<ChatTitleMenu
				context={context}
				workspaceId={workspaceId}
				linkedStores={linkedStores}
				onFork={onFork}
				onSearchAll={() => {
					closeIntent.current = "search";
				}}
				onNavigate={() => {
					closeIntent.current = "navigate";
				}}
			/>
		</PaneTitleMenu>
	);

	return (
		<ChatHistoryPicker
			context={context}
			workspaceId={workspaceId}
			linkedStores={linkedStores}
			returnFocusRef={triggerRef}
		>
			{path.length > 0 ? (
				<>
					<span className="shrink-0 text-muted-foreground">{icon}</span>
					<SubagentBreadcrumb
						onSelect={(id) => open(chatKey, id)}
						path={path}
						root={title}
						rootMenu={withMenu((triggerProps) => (
							<button
								{...triggerProps}
								aria-label={t({ message: "Chat menu" })}
								className="flex shrink-0 items-center gap-1 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							>
								{usageDot}
								<ChevronDown className="size-3" />
							</button>
						))}
					/>
				</>
			) : (
				withMenu((triggerProps) => (
					<button
						{...triggerProps}
						title={title}
						className={cn(
							"flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-xs transition-colors hover:bg-muted hover:text-foreground",
							context.isActive ? "text-foreground" : "text-muted-foreground",
						)}
					>
						<span className="shrink-0 text-muted-foreground">{icon}</span>
						<span className="min-w-0 truncate">{title}</span>
						{usageDot}
						<ChevronDown className="size-3 shrink-0 text-muted-foreground" />
					</button>
				))
			)}
		</ChatHistoryPicker>
	);
}
