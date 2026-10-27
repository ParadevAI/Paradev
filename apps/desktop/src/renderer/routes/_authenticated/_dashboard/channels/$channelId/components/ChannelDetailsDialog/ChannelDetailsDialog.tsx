import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import type { RouterOutputs } from "@superset/trpc";
import { Dialog, DialogContent, DialogTitle } from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { LuHash, LuLock } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { ChannelPerson } from "../ChannelMessageRow";
import { AboutTab } from "./components/AboutTab";
import {
	type ChannelNotify,
	ChannelNotifyMenu,
} from "./components/ChannelNotifyMenu";
import { MembersTab } from "./components/MembersTab";
import { SettingsTab } from "./components/SettingsTab";

export type ChannelDetailsTab = "about" | "members" | "settings";
type ChannelSummary = RouterOutputs["channel"]["get"];

interface ChannelDetailsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	tab: ChannelDetailsTab;
	onTabChange: (tab: ChannelDetailsTab) => void;
	channel: ChannelSummary;
	peopleById: Map<string, ChannelPerson>;
	currentUserId: string | null;
	onSetNotify: (notify: ChannelNotify | null) => void;
	onSetSuppressBroadcasts: (suppress: boolean) => void;
	onLeave: () => void;
	onArchive: () => void;
}

/** Slack's channel details: about, members and settings for one channel. */
export function ChannelDetailsDialog({
	open,
	onOpenChange,
	tab,
	onTabChange,
	channel,
	peopleById,
	currentUserId,
	onSetNotify,
	onSetSuppressBroadcasts,
	onLeave,
	onArchive,
}: ChannelDetailsDialogProps) {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const update = cloudTrpc.channel.update.useMutation({
		onSuccess: () => void utils.channel.invalidate(),
		onError: (error) =>
			toast.error(
				errorMessage(error, t({ message: "Couldn't save the change" })),
			),
	});
	const Icon = channel.visibility === "private" ? LuLock : LuHash;
	const tabs: { value: ChannelDetailsTab; label: string; count?: number }[] = [
		{ value: "about", label: t({ message: "About" }) },
		{
			value: "members",
			label: t({ message: "Members" }),
			count: channel.memberCount,
		},
		...(channel.canManage
			? [{ value: "settings" as const, label: t({ message: "Settings" }) }]
			: []),
	];

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
				<div className="flex flex-col gap-4 px-6 pt-6">
					<DialogTitle className="flex items-center gap-1 text-2xl font-bold">
						<Icon className="size-5 shrink-0" />
						<span className="truncate">{channel.name}</span>
					</DialogTitle>
					{channel.membership && (
						<div>
							<ChannelNotifyMenu
								value={channel.membership.notify}
								onChange={onSetNotify}
								suppressBroadcasts={channel.membership.suppressBroadcasts}
								onSuppressBroadcastsChange={onSetSuppressBroadcasts}
							/>
						</div>
					)}
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
								{entry.count !== undefined && (
									<span className="ml-1.5 text-muted-foreground">
										{entry.count}
									</span>
								)}
							</button>
						))}
					</div>
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 px-6 py-5">
					{tab === "about" && (
						<AboutTab
							channel={channel}
							peopleById={peopleById}
							onRename={(name) =>
								update.mutate({ channelId: channel.id, name })
							}
							onDescribe={(description) =>
								update.mutate({
									channelId: channel.id,
									description: description.trim() || null,
								})
							}
							onManageAdmins={() => onTabChange("members")}
							onLeave={onLeave}
						/>
					)}
					{tab === "members" && (
						<MembersTab channel={channel} currentUserId={currentUserId} />
					)}
					{tab === "settings" && channel.canManage && (
						<SettingsTab
							visibility={channel.visibility}
							onChange={(changes) =>
								update.mutate({ channelId: channel.id, ...changes })
							}
							onArchive={onArchive}
						/>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
