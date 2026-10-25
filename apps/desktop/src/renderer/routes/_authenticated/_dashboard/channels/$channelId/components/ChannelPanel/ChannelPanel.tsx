import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { LuCheck, LuMessageSquare, LuX } from "react-icons/lu";
import {
	type ChannelPanelTab,
	panelTabKey,
	useChannelPanelStore,
} from "../../stores/channelPanelStore";
import type { ChannelPerson } from "../ChannelMessageRow";
import { TaskPane } from "./components/TaskPane";
import { ThreadPane } from "./components/ThreadPane";

const EMPTY_TABS: ChannelPanelTab[] = [];

interface ChannelPanelProps {
	channelId: string;
	peopleById: Map<string, ChannelPerson>;
	people: ChannelPerson[];
	currentUserId: string | null;
	canModerate: boolean;
	canPost: boolean;
	now: Date;
}

export function ChannelPanel({ channelId, ...paneProps }: ChannelPanelProps) {
	const { t } = useLingui();
	const tabs = useChannelPanelStore(
		(state) => state.panels[channelId]?.tabs ?? EMPTY_TABS,
	);
	const activeKey = useChannelPanelStore(
		(state) => state.panels[channelId]?.activeKey ?? null,
	);
	const activate = useChannelPanelStore((state) => state.activate);
	const close = useChannelPanelStore((state) => state.close);
	const closeAll = useChannelPanelStore((state) => state.closeAll);
	const active = tabs.find((tab) => panelTabKey(tab) === activeKey) ?? tabs[0];
	if (!active) return null;

	return (
		<aside className="flex w-[440px] shrink-0 flex-col border-l border-border">
			<div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2">
				<div className="hide-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
					{tabs.map((tab) => {
						const key = panelTabKey(tab);
						const isActive = key === panelTabKey(active);
						return (
							<div
								key={key}
								className={cn(
									"group flex h-7 max-w-[168px] shrink-0 items-center gap-1.5 rounded-md pr-1 pl-2 text-xs",
									isActive
										? "bg-fill-selected text-foreground"
										: "text-muted-foreground hover:bg-fill-hover",
								)}
							>
								<button
									type="button"
									onClick={() => activate(channelId, key)}
									className="flex min-w-0 items-center gap-1.5"
								>
									{tab.kind === "thread" ? (
										<LuMessageSquare className="size-3.5 shrink-0" />
									) : (
										<LuCheck className="size-3.5 shrink-0" />
									)}
									<span className="truncate">{tab.label}</span>
								</button>
								<button
									type="button"
									aria-label={t({ message: "Close tab" })}
									onClick={() => close(channelId, key)}
									className="flex size-4 shrink-0 items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-fill-hover"
								>
									<LuX className="size-3" />
								</button>
							</div>
						);
					})}
				</div>
				<button
					type="button"
					aria-label={t({ message: "Close panel" })}
					onClick={() => closeAll(channelId)}
					className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-fill-hover hover:text-foreground"
				>
					<LuX className="size-4" />
				</button>
			</div>
			{active.kind === "thread" ? (
				<ThreadPane
					key={active.id}
					channelId={channelId}
					messageId={active.id}
					{...paneProps}
				/>
			) : (
				<TaskPane
					key={active.id}
					taskId={active.id}
					onClose={() => close(channelId, panelTabKey(active))}
				/>
			)}
		</aside>
	);
}
