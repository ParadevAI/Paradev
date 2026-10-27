import { useLingui } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import { Dialog, DialogContent, DialogTitle } from "@superset/ui/dialog";
import { cn } from "@superset/ui/utils";
import { DevAvatar } from "renderer/routes/_authenticated/_dashboard/components/DevAvatar";
import { AboutTab } from "./components/AboutTab";
import { AccessTab } from "./components/AccessTab";
import { InstructionsTab } from "./components/InstructionsTab";
import { SettingsTab } from "./components/SettingsTab";

export const DEV_DETAILS_TABS = [
	"about",
	"instructions",
	"access",
	"settings",
] as const;
export type DevDetailsTab = (typeof DEV_DETAILS_TABS)[number];
type Dev = RouterOutputs["agent"]["get"];

interface DevDetailsDialogProps {
	dev: Dev;
	tab: DevDetailsTab | undefined;
	onTabChange: (tab: DevDetailsTab | undefined) => void;
	onCustomize: () => void;
	onTogglePause: () => void;
	onArchive: () => void;
}

export function DevDetailsDialog({
	dev,
	tab,
	onTabChange,
	onCustomize,
	onTogglePause,
	onArchive,
}: DevDetailsDialogProps) {
	const { t } = useLingui();
	const tabs: { value: DevDetailsTab; label: string }[] = [
		{ value: "about", label: t({ message: "About" }) },
		...(dev.canManage
			? [
					{
						value: "instructions" as const,
						label: t({ message: "Instructions" }),
					},
					{ value: "access" as const, label: t({ message: "Access" }) },
					{ value: "settings" as const, label: t({ message: "Settings" }) },
				]
			: []),
	];
	return (
		<Dialog
			open={tab !== undefined}
			onOpenChange={(next) => !next && onTabChange(undefined)}
		>
			<DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
				<div className="flex flex-col gap-4 px-6 pt-6">
					<DialogTitle className="flex items-center gap-2 text-2xl font-bold">
						<DevAvatar
							avatar={dev.avatar}
							size={28}
							mood={dev.pausedAt ? "asleep" : "idle"}
						/>
						<span className="truncate">{dev.name}</span>
					</DialogTitle>
					<div className="-mx-6 flex gap-6 border-b border-border px-6">
						{tabs.map((entry) => (
							<button
								key={entry.value}
								type="button"
								onClick={() => onTabChange(entry.value)}
								className={cn(
									"-mb-px border-b-2 pb-2 text-sm font-medium transition-colors",
									tab === entry.value
										? "border-foreground text-foreground"
										: "border-transparent text-muted-foreground hover:text-foreground",
								)}
							>
								{entry.label}
							</button>
						))}
					</div>
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 px-6 py-5">
					{tab === "about" && <AboutTab dev={dev} onCustomize={onCustomize} />}
					{tab === "instructions" && dev.canManage && (
						<InstructionsTab dev={dev} />
					)}
					{tab === "access" && dev.canManage && <AccessTab dev={dev} />}
					{tab === "settings" && dev.canManage && (
						<SettingsTab
							dev={dev}
							onTogglePause={onTogglePause}
							onArchive={onArchive}
						/>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
