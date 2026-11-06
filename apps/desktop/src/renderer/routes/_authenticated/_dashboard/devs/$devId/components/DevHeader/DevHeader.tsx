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
	LuActivity,
	LuArchive,
	LuChevronRight,
	LuCirclePause,
	LuCirclePlay,
	LuCopy,
	LuEllipsisVertical,
	LuPencil,
} from "react-icons/lu";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { DevAvatar } from "renderer/routes/_authenticated/_dashboard/components/DevAvatar";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { RightSidebarToggle } from "renderer/routes/_authenticated/_dashboard/components/RightSidebarToggle";
import { PROTOCOL_SCHEME } from "shared/constants";
import { DevStatus } from "../DevProfile/components/DevStatus";

type Dev = RouterOutputs["agent"]["get"];

interface DevHeaderProps {
	dev: Dev;
	pane: { isOpen: boolean; toggle: () => void };
	onOpenProfile: () => void;
	onOpenActivity: () => void;
	onCustomize: () => void;
	onTogglePause: () => void;
	onArchive: () => void;
}

/** The Dev's name opens its profile; what it is doing now sits beside it. */
export function DevHeader({
	dev,
	pane,
	onOpenProfile,
	onOpenActivity,
	onCustomize,
	onTogglePause,
	onArchive,
}: DevHeaderProps) {
	const { t } = useLingui();
	const { copyToClipboard } = useCopyToClipboard();
	const isPaused = dev.pausedAt !== null;
	return (
		<PageHeader
			className="border-b border-border"
			reservesWindowControls={!pane.isOpen}
			start={
				<div className="flex min-w-0 items-center gap-2">
					<Tooltip delayDuration={500}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={onOpenProfile}
								className="group flex h-8 min-w-0 items-center gap-1.5 rounded-md pr-1.5 pl-1.5 transition-colors hover:bg-fill-hover"
							>
								<DevAvatar
									avatar={dev.avatar}
									size={22}
									mood={isPaused ? "asleep" : dev.working ? "working" : "idle"}
								/>
								<span className="truncate text-[15px] font-semibold">
									{dev.name}
								</span>
								<LuChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-px" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<Trans>About this Dev</Trans>
						</TooltipContent>
					</Tooltip>
					<span className="hidden min-w-0 truncate @[560px]:block">
						<DevStatus dev={dev} />
					</span>
				</div>
			}
			end={
				<div className="flex items-center gap-1">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								aria-label={t({ message: "Dev options" })}
								className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
							>
								<LuEllipsisVertical className="size-4" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-52">
							<DropdownMenuItem onSelect={onOpenActivity}>
								<LuActivity className="size-4" />
								<Trans>Activity</Trans>
							</DropdownMenuItem>
							{dev.canManage && (
								<>
									<DropdownMenuItem onSelect={onCustomize}>
										<LuPencil className="size-4" />
										<Trans>Customize</Trans>
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem onSelect={onTogglePause}>
										{isPaused ? (
											<>
												<LuCirclePlay className="size-4" />
												<Trans>Resume</Trans>
											</>
										) : (
											<>
												<LuCirclePause className="size-4" />
												<Trans>Pause</Trans>
											</>
										)}
									</DropdownMenuItem>
								</>
							)}
							<DropdownMenuItem
								onSelect={() =>
									void copyToClipboard(`${PROTOCOL_SCHEME}://devs/${dev.id}`)
								}
							>
								<LuCopy className="size-4" />
								<Trans>Copy link</Trans>
							</DropdownMenuItem>
							{dev.canManage && (
								<>
									<DropdownMenuSeparator />
									<DropdownMenuItem variant="destructive" onSelect={onArchive}>
										<LuArchive className="size-4" />
										<Trans>Archive</Trans>
									</DropdownMenuItem>
								</>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
					{!pane.isOpen && (
						<RightSidebarToggle isOpen={false} onToggle={pane.toggle} compact />
					)}
				</div>
			}
		/>
	);
}
