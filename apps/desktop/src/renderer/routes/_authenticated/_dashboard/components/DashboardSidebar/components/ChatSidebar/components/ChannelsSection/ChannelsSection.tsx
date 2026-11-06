import { Trans, useLingui } from "@lingui/react/macro";
import { formatCompactRelativeTime } from "@superset/i18n/format";
import type { RouterOutputs } from "@superset/trpc";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LuHash, LuLock, LuPlus } from "react-icons/lu";
import { StateDot } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/components/StateDot";
import type { CoordinatorPreview } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/hooks/useCoordinatorPreviews";
import { useChannelActivityStore } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/stores/channelActivityStore";
import { eventLine } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/utils/activityEntries";
import { previewLine } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/utils/previewLine";
import { useSidebarSectionsCollapseStore } from "renderer/stores/sidebar-sections-collapse";
import { DashboardSidebarSectionHeader } from "../../../DashboardSidebarSectionHeader";
import { type Attention, NO_ATTENTION } from "../../utils/attention";
import { ChannelContextMenu } from "../ChannelContextMenu";
import { ChatRow } from "../ChatRow";
import { CreateChannelDialog } from "../CreateChannelDialog";

type Channel = RouterOutputs["channel"]["list"][number];

interface ChannelsSectionProps {
	channels: readonly Channel[];
	/** What each channel wants from the reader, by channel id. */
	attention: ReadonlyMap<string, Attention>;
	/** What each channel's coordinator last said, by channel id. */
	previews: ReadonlyMap<string, CoordinatorPreview>;
	/** Who wrote a post, as a row prefixes it: "You", a first name, a Dev's name. */
	authorName: (id: string | null) => string | null;
	/** The list is narrowed by the strip above, so an empty one is not "none yet". */
	filtered: boolean;
}

export function ChannelsSection({
	channels,
	attention,
	previews,
	authorName,
	filtered,
}: ChannelsSectionProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const [isCreating, setCreating] = useState(false);
	const isCollapsed = useSidebarSectionsCollapseStore(
		(state) => state.collapsed.channels,
	);
	const activity = useChannelActivityStore((state) => state.byChannelId);
	const subtitle = (channel: Channel): string | undefined => {
		const preview = previews.get(channel.id);
		const event = activity[channel.id]?.events.at(-1);
		const postedAt = channel.lastMessageAt?.getTime() ?? 0;
		const saidAt = preview?.at ?? 0;
		const eventAt = event?.at ?? 0;
		if (
			preview &&
			(preview.asks || (saidAt >= eventAt && saidAt >= postedAt))
		) {
			return t({ message: `Coordinator: ${preview.line}` });
		}
		if (event && eventAt >= postedAt) {
			return t(
				eventLine({
					name: event.name,
					event: event.kind,
					...(event.prNumber === undefined ? {} : { prNumber: event.prNumber }),
				}),
			);
		}
		const post = channel.lastMessageBody
			? previewLine(channel.lastMessageBody, 80)
			: null;
		if (!post) return undefined;
		const author = authorName(channel.lastMessageAuthorId);
		return author ? `${author}: ${post}` : post;
	};
	const active = matchRoute({ to: "/channels/$channelId", fuzzy: true });
	const activeChannelId =
		active && !matchRoute({ to: "/channels/threads" })
			? active.channelId
			: null;

	const trailing = (channel: Channel) => {
		const entry = attention.get(channel.id) ?? NO_ATTENTION;
		if (entry.asks && entry.needsYou === 1) {
			return (
				<>
					<StateDot state="waiting" />
					<span className="text-foreground">
						<Trans>asks you</Trans>
					</span>
				</>
			);
		}
		if (entry.needsYou > 0) {
			return (
				<>
					<StateDot state="waiting" />
					<span className="text-foreground">{entry.needsYou}</span>
				</>
			);
		}
		if (entry.running > 0) {
			return (
				<>
					<StateDot state="working" />
					{entry.running}
				</>
			);
		}
		if (channel.hasUnread && !channel.muted && channel.id !== activeChannelId) {
			return <span className="size-1.5 rounded-full bg-foreground" />;
		}
		const latestAt = Math.max(
			activity[channel.id]?.events.at(-1)?.at ?? 0,
			channel.lastMessageAt?.getTime() ?? 0,
			previews.get(channel.id)?.at ?? 0,
		);
		return latestAt > 0
			? formatCompactRelativeTime(new Date(latestAt))
			: undefined;
	};

	if (filtered && channels.length === 0) return null;
	return (
		<div className="pb-1">
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
			{!isCollapsed && (
				<div className="flex flex-col gap-px px-2">
					{channels.length === 0 && !filtered && (
						<p className="px-2 py-1.5 text-[12px] text-muted-foreground">
							<Trans>No channels yet</Trans>
						</p>
					)}
					{channels.map((channel) => {
						const Icon = channel.visibility === "private" ? LuLock : LuHash;
						const entry = attention.get(channel.id) ?? NO_ATTENTION;
						return (
							<ChannelContextMenu
								key={channel.id}
								channel={channel}
								isActive={channel.id === activeChannelId}
							>
								<ChatRow
									leading={
										<span className="flex size-6 items-center justify-center rounded-[7px] border border-border bg-background text-muted-foreground">
											<Icon className="size-3" />
										</span>
									}
									title={channel.name}
									subtitle={subtitle(channel)}
									trailing={trailing(channel)}
									isActive={channel.id === activeChannelId}
									isUnread={
										channel.hasUnread || channel.mentionCount > 0 || entry.asks
									}
									isMuted={channel.muted}
									onClick={() =>
										void navigate({
											to: "/channels/$channelId",
											params: { channelId: channel.id },
										})
									}
								/>
							</ChannelContextMenu>
						);
					})}
				</div>
			)}
			<CreateChannelDialog open={isCreating} onOpenChange={setCreating} />
		</div>
	);
}
