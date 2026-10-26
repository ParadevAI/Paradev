import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LuPlus } from "react-icons/lu";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useSidebarSectionsCollapseStore } from "renderer/stores/sidebar-sections-collapse";
import { DashboardSidebarSectionHeader } from "../DashboardSidebarSectionHeader";
import { ChannelContextMenu } from "./components/ChannelContextMenu";
import { ChannelRow } from "./components/ChannelRow";
import { CreateChannelDialog } from "./components/CreateChannelDialog";
import { MarkAllReadShortcut } from "./components/MarkAllReadShortcut";
import { ThreadsRow } from "./components/ThreadsRow";

export function DashboardSidebarChannelsSection() {
	const { t } = useLingui();
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const organizationId = useActiveOrganizationId();
	const [isCreating, setCreating] = useState(false);
	const isSectionCollapsed = useSidebarSectionsCollapseStore(
		(s) => s.collapsed.channels,
	);
	const { data: channels = [] } = cloudTrpc.channel.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: organizationId !== null },
	);
	const { data: threads = [] } = cloudTrpc.channelThread.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: organizationId !== null },
	);
	const mutedIds = new Set(
		channels.filter((channel) => channel.muted).map((channel) => channel.id),
	);
	const threadsUnread = threads.some(
		(thread) => thread.unreadCount > 0 && !mutedIds.has(thread.channelId),
	);
	const threadMentions = threads.reduce(
		(sum, thread) => sum + thread.mentionCount,
		0,
	);
	const isThreadsActive = Boolean(matchRoute({ to: "/channels/threads" }));
	const active = matchRoute({ to: "/channels/$channelId", fuzzy: true });
	const activeChannelId = active && !isThreadsActive ? active.channelId : null;

	return (
		<div className="mt-3 pb-1 first:mt-0">
			<DashboardSidebarSectionHeader
				label={t({ message: "Channels" })}
				section="channels"
			>
				<Tooltip delayDuration={700}>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label={t({ message: "Create a channel" })}
							onClick={(event) => {
								event.stopPropagation();
								setCreating(true);
							}}
							onKeyDown={(event) => event.stopPropagation()}
							className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
						>
							<LuPlus className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<Trans>Create a channel</Trans>
					</TooltipContent>
				</Tooltip>
			</DashboardSidebarSectionHeader>
			{!isSectionCollapsed && (
				<div className="flex flex-col gap-px px-2">
					<ThreadsRow
						hasUnread={threadsUnread}
						mentionCount={threadMentions}
						isActive={isThreadsActive}
						onClick={() => void navigate({ to: "/channels/threads" })}
					/>
					{channels.map((channel) => (
						<ChannelContextMenu
							key={channel.id}
							channel={channel}
							isActive={channel.id === activeChannelId}
						>
							<ChannelRow
								name={channel.name}
								visibility={channel.visibility}
								hasUnread={channel.hasUnread}
								muted={channel.muted}
								mentionCount={channel.mentionCount}
								isActive={channel.id === activeChannelId}
								onClick={() =>
									void navigate({
										to: "/channels/$channelId",
										params: { channelId: channel.id },
									})
								}
							/>
						</ChannelContextMenu>
					))}
				</div>
			)}
			<CreateChannelDialog open={isCreating} onOpenChange={setCreating} />
			{organizationId && (
				<MarkAllReadShortcut organizationId={organizationId} />
			)}
		</div>
	);
}
