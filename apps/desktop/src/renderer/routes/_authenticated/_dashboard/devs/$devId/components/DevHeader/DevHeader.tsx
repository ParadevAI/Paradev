import { Trans, useLingui } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import {
	LuArchive,
	LuCirclePause,
	LuCirclePlay,
	LuCopy,
	LuEllipsisVertical,
	LuInfo,
	LuPencil,
} from "react-icons/lu";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { DevAvatar } from "renderer/routes/_authenticated/_dashboard/components/DevAvatar";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { RightSidebarToggle } from "renderer/routes/_authenticated/_dashboard/components/RightSidebarToggle";
import { PROTOCOL_SCHEME } from "shared/constants";

export type DevTab = "chat" | "work";
type Dev = RouterOutputs["agent"]["get"];

interface DevHeaderProps {
	dev: Dev;
	tab: DevTab;
	onTabChange: (tab: DevTab) => void;
	/** The DM room's right panel (threads); absent on the Work tab. */
	panel: { isOpen: boolean; toggle: () => void } | null;
	onCustomize: () => void;
	onOpenDetails: () => void;
	onTogglePause: () => void;
	onArchive: () => void;
}

export function DevHeader({
	dev,
	tab,
	onTabChange,
	panel,
	onCustomize,
	onOpenDetails,
	onTogglePause,
	onArchive,
}: DevHeaderProps) {
	const { t } = useLingui();
	const { copyToClipboard } = useCopyToClipboard();
	const tabs: { value: DevTab; label: string }[] = [
		{ value: "chat", label: t({ message: "Chat" }) },
		{ value: "work", label: t({ message: "Work" }) },
	];
	const isPaused = dev.pausedAt !== null;
	return (
		<PageHeader
			className="border-b border-border"
			reservesWindowControls={!panel?.isOpen}
			start={
				<div className="flex min-w-0 items-center gap-3">
					<div className="flex min-w-0 items-center gap-2 px-1.5">
						<DevAvatar
							avatar={dev.avatar}
							size={20}
							mood={isPaused ? "asleep" : "idle"}
						/>
						<span className="truncate text-[15px] font-bold">{dev.name}</span>
					</div>
					<div className="flex items-center gap-0.5">
						{tabs.map((entry) => (
							<button
								key={entry.value}
								type="button"
								onClick={() => onTabChange(entry.value)}
								className={cn(
									"h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
									tab === entry.value
										? "bg-fill-selected text-foreground"
										: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
								)}
							>
								{entry.label}
							</button>
						))}
					</div>
				</div>
			}
			end={
				<div className="flex items-center gap-1">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								aria-label={t({ message: "Dev options" })}
								className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-fill-hover hover:text-foreground"
							>
								<LuEllipsisVertical className="size-4" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-52">
							{dev.canManage && (
								<>
									<DropdownMenuItem onSelect={onCustomize}>
										<LuPencil className="size-4" />
										<Trans>Customize</Trans>
									</DropdownMenuItem>
									<DropdownMenuItem onSelect={onOpenDetails}>
										<LuInfo className="size-4" />
										<Trans>Dev details</Trans>
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
					{panel && !panel.isOpen && (
						<RightSidebarToggle
							isOpen={false}
							onToggle={panel.toggle}
							compact
						/>
					)}
				</div>
			}
		/>
	);
}
