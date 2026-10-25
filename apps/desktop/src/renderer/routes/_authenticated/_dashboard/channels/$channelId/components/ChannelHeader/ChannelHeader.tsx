import { Trans, useLingui } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { LuEllipsis, LuHash, LuLock, LuUsers } from "react-icons/lu";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";

export type ChannelTab = "messages" | "tasks";
type ChannelSummary = RouterOutputs["channel"]["get"];
type Notify = "all" | "mentions" | "none";

interface ChannelHeaderProps {
	channel: ChannelSummary;
	tab: ChannelTab;
	onTabChange: (tab: ChannelTab) => void;
	onOpenMembers: () => void;
	onOpenSettings: () => void;
	onArchive: () => void;
	onLeave: () => void;
	onSetNotify: (notify: Notify) => void;
}

export function ChannelHeader({
	channel,
	tab,
	onTabChange,
	onOpenMembers,
	onOpenSettings,
	onArchive,
	onLeave,
	onSetNotify,
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
			start={
				<div className="flex min-w-0 items-center gap-3">
					<div className="flex min-w-0 items-center gap-1">
						<Icon className="size-4 shrink-0 text-muted-foreground" />
						<span className="truncate text-sm font-semibold">
							{channel.name}
						</span>
					</div>
					{channel.description && (
						<span className="hidden max-w-80 truncate text-xs text-muted-foreground lg:block">
							{channel.description}
						</span>
					)}
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
					<button
						type="button"
						onClick={onOpenMembers}
						className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-fill-hover hover:text-foreground"
					>
						<LuUsers className="size-3.5" />
						<span className="tabular-nums">{channel.memberCount}</span>
					</button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								aria-label={t({ message: "Channel options" })}
								className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-fill-hover hover:text-foreground"
							>
								<LuEllipsis className="size-4" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-52">
							{channel.membership && (
								<DropdownMenuSub>
									<DropdownMenuSubTrigger>
										<Trans>Notifications</Trans>
									</DropdownMenuSubTrigger>
									<DropdownMenuSubContent>
										<DropdownMenuRadioGroup
											value={channel.membership.notify}
											onValueChange={(value) => onSetNotify(value as Notify)}
										>
											<DropdownMenuRadioItem value="all">
												<Trans>All messages</Trans>
											</DropdownMenuRadioItem>
											<DropdownMenuRadioItem value="mentions">
												<Trans>Mentions and replies</Trans>
											</DropdownMenuRadioItem>
											<DropdownMenuRadioItem value="none">
												<Trans>Nothing</Trans>
											</DropdownMenuRadioItem>
										</DropdownMenuRadioGroup>
									</DropdownMenuSubContent>
								</DropdownMenuSub>
							)}
							{channel.canManage && (
								<DropdownMenuItem onSelect={onOpenSettings}>
									<Trans>Channel settings</Trans>
								</DropdownMenuItem>
							)}
							{(channel.membership || channel.canManage) && (
								<DropdownMenuSeparator />
							)}
							{channel.membership && (
								<DropdownMenuItem onSelect={onLeave}>
									<Trans>Leave channel</Trans>
								</DropdownMenuItem>
							)}
							{channel.canManage && (
								<DropdownMenuItem variant="destructive" onSelect={onArchive}>
									<Trans>Archive channel</Trans>
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			}
		/>
	);
}
