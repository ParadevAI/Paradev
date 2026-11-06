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
	LuChevronRight,
	LuDiamond,
	LuEllipsisVertical,
	LuHash,
	LuLock,
	LuLogOut,
	LuPencil,
	LuSettings2,
	LuUserPlus,
} from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { RightSidebarToggle } from "renderer/routes/_authenticated/_dashboard/components/RightSidebarToggle";
import { PersonAvatar } from "../PersonAvatar";
import { StateDot } from "../StateDot";

type ChannelSummary = RouterOutputs["channel"]["get"];
const SHOWN_AVATARS = 3;

interface ChannelHeaderProps {
	channel: ChannelSummary;
	/** Who coordinates the channel and whether its agents are at work; absent until one is started. */
	coordinator?: { label: string; busy: boolean };
	isPaneOpen: boolean;
	onTogglePane: () => void;
	onOpenOverview: () => void;
	onOpenCoordinator: () => void;
	onOpenMembers: () => void;
	onOpenSettings: () => void;
	onRename?: () => void;
	onEditDescription?: () => void;
	onLeave: () => void;
	onToggleMute: () => void;
	onArchive: () => void;
}

/** The channel's name opens it at a glance; its coordinator, people and the rest of the menu sit at the end. */
export function ChannelHeader({
	channel,
	coordinator,
	isPaneOpen,
	onTogglePane,
	onOpenOverview,
	onOpenCoordinator,
	onOpenMembers,
	onOpenSettings,
	onRename,
	onEditDescription,
	onLeave,
	onToggleMute,
	onArchive,
}: ChannelHeaderProps) {
	const { t } = useLingui();
	const Icon = channel.visibility === "private" ? LuLock : LuHash;
	const { data: members = [] } = cloudTrpc.channel.members.useQuery({
		channelId: channel.id,
	});
	const people = members.flatMap((member) =>
		member.kind === "person" ? [member] : [],
	);
	return (
		<PageHeader
			className="border-b border-border"
			reservesWindowControls={!isPaneOpen}
			start={
				<div className="flex min-w-0 items-center gap-2">
					<Tooltip delayDuration={500}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={onOpenOverview}
								className="group flex h-8 max-w-[280px] shrink-0 items-center gap-1 rounded-md pr-1.5 pl-2 transition-colors hover:bg-fill-hover"
							>
								<Icon className="size-4 shrink-0 text-muted-foreground" />
								<span className="truncate text-[15px] font-semibold">
									{channel.name}
								</span>
								<LuChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-px" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<Trans>About this channel</Trans>
						</TooltipContent>
					</Tooltip>
					{channel.description && (
						<span className="hidden min-w-0 truncate text-[13px] text-muted-foreground @[560px]:block">
							{channel.description}
						</span>
					)}
				</div>
			}
			end={
				<div className="flex items-center gap-1">
					{coordinator && (
						<Tooltip delayDuration={500}>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={onOpenCoordinator}
									className="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
								>
									<LuDiamond className="size-3.5" />
									<span className="hidden @[720px]:inline">
										<Trans>Coordinator</Trans>
									</span>
									<StateDot state={coordinator.busy ? "working" : "idle"} />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								{coordinator.busy ? (
									<Trans>
										Coordinator · {coordinator.label} · agents at work
									</Trans>
								) : (
									<Trans>Coordinator · {coordinator.label}</Trans>
								)}
							</TooltipContent>
						</Tooltip>
					)}
					<Tooltip delayDuration={500}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={onOpenMembers}
								className="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
							>
								{people.length > 0 && (
									<span className="flex items-center">
										{people.slice(0, SHOWN_AVATARS).map((person, index) => (
											<PersonAvatar
												key={person.actorId}
												name={person.name}
												image={person.image}
												className={
													index === 0
														? "size-5 text-[9px] ring-2 ring-background"
														: "-ml-1.5 size-5 text-[9px] ring-2 ring-background"
												}
											/>
										))}
									</span>
								)}
								{channel.memberCount > 1 && (
									<span className="tabular-nums">{channel.memberCount}</span>
								)}
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<Trans>People in this channel</Trans>
						</TooltipContent>
					</Tooltip>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								aria-label={t({ message: "Channel options" })}
								className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
							>
								<LuEllipsisVertical className="size-4" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-56">
							<DropdownMenuItem onSelect={onOpenMembers}>
								<LuUserPlus className="size-4" />
								<Trans>Add people</Trans>
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={onOpenSettings}>
								<LuSettings2 className="size-4" />
								<Trans>Notifications and settings</Trans>
							</DropdownMenuItem>
							{channel.membership && (
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
							)}
							{(onRename || onEditDescription) && (
								<>
									<DropdownMenuSeparator />
									{onRename && (
										<DropdownMenuItem onSelect={onRename}>
											<LuPencil className="size-4" />
											<Trans>Rename</Trans>
										</DropdownMenuItem>
									)}
									{onEditDescription && (
										<DropdownMenuItem onSelect={onEditDescription}>
											<LuPencil className="size-4" />
											<Trans>Edit goal</Trans>
										</DropdownMenuItem>
									)}
								</>
							)}
							{channel.membership && (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuItem onSelect={onLeave}>
										<LuLogOut className="size-4" />
										<Trans>Leave channel</Trans>
									</DropdownMenuItem>
								</>
							)}
							{channel.canManage && (
								<DropdownMenuItem variant="destructive" onSelect={onArchive}>
									<LuArchive className="size-4" />
									<Trans>Archive channel</Trans>
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
					{!isPaneOpen && (
						<RightSidebarToggle
							isOpen={false}
							onToggle={onTogglePane}
							compact
						/>
					)}
				</div>
			}
		/>
	);
}
