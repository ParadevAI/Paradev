import { Trans, useLingui } from "@lingui/react/macro";
import { formatCompactRelativeTime } from "@superset/i18n/format";
import type { RouterOutputs } from "@superset/trpc";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LuPlus } from "react-icons/lu";
import { StateDot } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/components/StateDot";
import { previewLine } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/utils/previewLine";
import { CustomizeDevDialog } from "renderer/routes/_authenticated/_dashboard/components/CustomizeDevDialog";
import { DevAvatar } from "renderer/routes/_authenticated/_dashboard/components/DevAvatar";
import { useSidebarSectionsCollapseStore } from "renderer/stores/sidebar-sections-collapse";
import { DashboardSidebarSectionHeader } from "../../../DashboardSidebarSectionHeader";
import { type Attention, NO_ATTENTION } from "../../utils/attention";
import { ChatRow } from "../ChatRow";
import { DevContextMenu } from "../DevContextMenu";

type Dev = RouterOutputs["agent"]["list"][number];

interface DevsSectionProps {
	devs: readonly Dev[];
	/** What each Dev wants from the reader, by Dev id. */
	attention: ReadonlyMap<string, Attention>;
	/** The list is narrowed by the strip above, so an empty one is not "none yet". */
	filtered: boolean;
}

export function DevsSection({ devs, attention, filtered }: DevsSectionProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const [isCreating, setCreating] = useState(false);
	const isCollapsed = useSidebarSectionsCollapseStore(
		(state) => state.collapsed.devs,
	);
	const active = matchRoute({ to: "/devs/$devId", fuzzy: true });
	const activeDevId = active ? active.devId : null;
	const subtitle = (dev: Dev): string | undefined => {
		if (!dev.dmLastMessageBody) return undefined;
		const line = previewLine(dev.dmLastMessageBody, 80);
		if (!line) return undefined;
		const own =
			dev.dmLastMessageAuthorId !== null &&
			dev.dmLastMessageAuthorId !== dev.id;
		return own ? t({ message: `You: ${line}` }) : line;
	};
	const trailing = (dev: Dev) => {
		if (dev.pausedAt) return <Trans>Paused</Trans>;
		if (dev.isWorking) return <StateDot state="working" />;
		const entry = attention.get(dev.id) ?? NO_ATTENTION;
		if (entry.asks) {
			return (
				<>
					<StateDot state="waiting" />
					<span className="text-foreground">
						<Trans>asks you</Trans>
					</span>
				</>
			);
		}
		if (dev.dmHasUnread && dev.id !== activeDevId) {
			return <span className="size-1.5 rounded-full bg-foreground" />;
		}
		return dev.dmLastMessageAt
			? formatCompactRelativeTime(dev.dmLastMessageAt)
			: undefined;
	};

	if (filtered && devs.length === 0) return null;
	return (
		<div className="pb-1">
			<DashboardSidebarSectionHeader
				label={t({ message: "Devs" })}
				section="devs"
			>
				<Tooltip delayDuration={700}>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label={t({ message: "Create a Dev" })}
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
						<Trans>Create a Dev</Trans>
					</TooltipContent>
				</Tooltip>
			</DashboardSidebarSectionHeader>
			{!isCollapsed && (
				<div className="flex flex-col gap-px px-2">
					{devs.length === 0 && !filtered && (
						<p className="px-2 py-1.5 text-[12px] text-muted-foreground">
							<Trans>No Devs yet</Trans>
						</p>
					)}
					{devs.map((dev) => (
						<DevContextMenu
							key={dev.id}
							dev={dev}
							isActive={dev.id === activeDevId}
						>
							<ChatRow
								leading={
									<DevAvatar
										avatar={dev.avatar}
										size={24}
										mood={
											dev.pausedAt
												? "asleep"
												: dev.isWorking
													? "working"
													: "idle"
										}
									/>
								}
								title={dev.name}
								subtitle={subtitle(dev)}
								trailing={trailing(dev)}
								isActive={dev.id === activeDevId}
								isUnread={
									dev.dmHasUnread || (attention.get(dev.id)?.asks ?? false)
								}
								onClick={() =>
									void navigate({
										to: "/devs/$devId",
										params: { devId: dev.id },
									})
								}
							/>
						</DevContextMenu>
					))}
				</div>
			)}
			<CustomizeDevDialog open={isCreating} onOpenChange={setCreating} />
		</div>
	);
}
