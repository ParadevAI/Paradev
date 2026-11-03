import { Trans, useLingui } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import {
	LuArchive,
	LuBell,
	LuBellOff,
	LuEllipsisVertical,
	LuHash,
	LuInfo,
	LuLock,
	LuLogOut,
	LuUser,
} from "react-icons/lu";
import { HeaderTabs } from "renderer/routes/_authenticated/_dashboard/components/HeaderTabs";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { RightSidebarToggle } from "renderer/routes/_authenticated/_dashboard/components/RightSidebarToggle";
import type { ChannelDetailsTab } from "../ChannelDetailsDialog";

export type ChannelTab = "messages" | "tasks";
type ChannelSummary = RouterOutputs["channel"]["get"];

interface ChannelHeaderProps {
	channel: ChannelSummary;
	isPanelOpen: boolean;
	onTogglePanel: () => void;
	tab: ChannelTab;
	onTabChange: (tab: ChannelTab) => void;
	onOpenDetails: (tab: ChannelDetailsTab) => void;
	onLeave: () => void;
	onToggleMute: () => void;
	onArchive: () => void;
}

/** Slack's channel header: the title opens channel details; members, bell and more on the right. */
export function ChannelHeader({
	channel,
	isPanelOpen,
	onTogglePanel,
	tab,
	onTabChange,
	onOpenDetails,
	onLeave,
	onToggleMute,
	onArchive,
}: ChannelHeaderProps) {
	const { t } = useLingui();
	const Icon = channel.visibility === "private" ? LuLock : LuHash;
	const tabs: { value: ChannelTab; label: string }[] = [
		{ value: "messages", label: t({ message: "Messages" }) },
		{ value: "tasks", label: t({ message: "Tasks" }) },
	];
	return (
		<PageHeader
			className="border-b border-border"
			reservesWindowControls={!isPanelOpen}
			start={
				<div className="flex min-w-0 items-center gap-3">
					<Tooltip delayDuration={500}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={() => onOpenDetails("about")}
								className="flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 hover:bg-fill-hover"
							>
								<Icon className="size-4 shrink-0" />
								<span className="truncate text-[15px] font-bold">
									{channel.name}
								</span>
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<Trans>Get channel details</Trans>
						</TooltipContent>
					</Tooltip>
					<HeaderTabs tabs={tabs} value={tab} onChange={onTabChange} />
				</div>
			}
			end={
				<div className="flex items-center gap-1">
					<Tooltip delayDuration={500}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={() => onOpenDetails("members")}
								className="flex h-7 items-center gap-1 rounded-md px-1.5 text-sm text-muted-foreground hover:bg-fill-hover hover:text-foreground"
							>
								<LuUser className="size-4" />
								<span className="tabular-nums">{channel.memberCount}</span>
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<Trans>View all members of this channel</Trans>
						</TooltipContent>
					</Tooltip>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								aria-label={t({ message: "Channel options" })}
								className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-fill-hover hover:text-foreground"
							>
								<LuEllipsisVertical className="size-4" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-52">
							<DropdownMenuItem onSelect={() => onOpenDetails("about")}>
								<LuInfo className="size-4" />
								<Trans>Channel details</Trans>
							</DropdownMenuItem>
							{channel.membership && (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuItem onSelect={onToggleMute}>
										{channel.membership.muted ? (
											<>
												<LuBell className="size-4" />
												<Trans>Unmute channel</Trans>
											</>
										) : (
											<>
												<LuBellOff className="size-4" />
												<Trans>Mute channel</Trans>
											</>
										)}
									</DropdownMenuItem>
									<DropdownMenuItem onSelect={onLeave}>
										<LuLogOut className="size-4" />
										<Trans>Leave channel</Trans>
									</DropdownMenuItem>
								</>
							)}
							{channel.canManage && (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuItem variant="destructive" onSelect={onArchive}>
										<LuArchive className="size-4" />
										<Trans>Archive channel</Trans>
									</DropdownMenuItem>
								</>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
					{!isPanelOpen && (
						<RightSidebarToggle
							isOpen={false}
							onToggle={onTogglePanel}
							compact
						/>
					)}
				</div>
			}
		/>
	);
}
