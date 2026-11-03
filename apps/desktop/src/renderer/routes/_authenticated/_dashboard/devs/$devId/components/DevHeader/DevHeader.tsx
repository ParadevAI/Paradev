import { Trans, useLingui } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import {
	LuArchive,
	LuCirclePause,
	LuCirclePlay,
	LuCopy,
	LuEllipsisVertical,
	LuPencil,
} from "react-icons/lu";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { DevAvatar } from "renderer/routes/_authenticated/_dashboard/components/DevAvatar";
import { HeaderTabs } from "renderer/routes/_authenticated/_dashboard/components/HeaderTabs";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { RightSidebarToggle } from "renderer/routes/_authenticated/_dashboard/components/RightSidebarToggle";
import { PROTOCOL_SCHEME } from "shared/constants";

type Dev = RouterOutputs["agent"]["get"];

export type DevTab = "chat" | "activity";

interface DevHeaderProps {
	dev: Dev;
	tab: DevTab;
	onTabChange: (tab: DevTab) => void;
	panel: { isOpen: boolean; toggle: () => void };
	onCustomize: () => void;
	onTogglePause: () => void;
	onArchive: () => void;
}

export function DevHeader({
	dev,
	tab,
	onTabChange,
	panel,
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
			reservesWindowControls={!panel.isOpen}
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
					<HeaderTabs
						tabs={[
							{ value: "chat", label: t({ message: "Chat" }) },
							{ value: "activity", label: t({ message: "Activity" }) },
						]}
						value={tab}
						onChange={onTabChange}
					/>
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
					{!panel.isOpen && (
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
