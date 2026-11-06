import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import type { RouterOutputs } from "@superset/trpc";
import { Button } from "@superset/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { LuHash, LuLock } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { PaneSection } from "../PaneSection";
import { ChannelNotifyMenu } from "./components/ChannelNotifyMenu";

type ChannelSummary = RouterOutputs["channel"]["get"];
type Visibility = ChannelSummary["visibility"];

interface SettingsPageProps {
	channel: ChannelSummary;
	onRename?: () => void;
	onEditDescription?: () => void;
	onLeave: () => void;
	onArchive: () => void;
}

/** How this channel reaches you, and what only its admins change. */
export function SettingsPage({
	channel,
	onRename,
	onEditDescription,
	onLeave,
	onArchive,
}: SettingsPageProps) {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const channelId = channel.id;
	const options = {
		onSuccess: () => void utils.channel.invalidate(),
		onError: (error: unknown) =>
			toast.error(
				errorMessage(error, t({ message: "Couldn't save the change" })),
			),
	};
	const setNotify = cloudTrpc.channel.setNotify.useMutation(options);
	const setSuppressBroadcasts =
		cloudTrpc.channel.setSuppressBroadcasts.useMutation(options);
	const setMuted = cloudTrpc.channel.setMuted.useMutation(options);
	const update = cloudTrpc.channel.update.useMutation(options);
	const membership = channel.membership;

	return (
		<div className="min-h-0 flex-1 overflow-y-auto">
			<div className="flex flex-col gap-5 p-3">
				{membership && (
					<PaneSection title={<Trans>Notifications</Trans>}>
						<div className="flex flex-col gap-3 px-2 py-1">
							<ChannelNotifyMenu
								value={membership.notify}
								onChange={(notify) => setNotify.mutate({ channelId, notify })}
								suppressBroadcasts={membership.suppressBroadcasts}
								onSuppressBroadcastsChange={(suppressBroadcasts) =>
									setSuppressBroadcasts.mutate({
										channelId,
										suppressBroadcasts,
									})
								}
							/>
							<div className="flex items-center justify-between gap-3 text-[13px]">
								<span className="flex flex-col">
									<span className="font-medium">
										<Trans>Mute</Trans>
									</span>
									<span className="text-[12px] text-muted-foreground">
										<Trans>No badges or sounds from this channel</Trans>
									</span>
								</span>
								<Switch
									aria-label={t({ message: "Mute" })}
									checked={membership.muted}
									onCheckedChange={(muted) =>
										setMuted.mutate({ channelId, muted })
									}
								/>
							</div>
						</div>
					</PaneSection>
				)}

				{channel.canManage && (
					<PaneSection title={<Trans>Channel</Trans>}>
						<div className="flex flex-col gap-3 px-2 py-1">
							<div className="flex items-center justify-between gap-3 text-[13px]">
								<span className="font-medium">
									<Trans>Visibility</Trans>
								</span>
								<Select
									value={channel.visibility}
									onValueChange={(value) =>
										update.mutate({
											channelId,
											visibility: value as Visibility,
										})
									}
								>
									<SelectTrigger className="h-8 w-40">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="public">
											<span className="flex items-center gap-2">
												<LuHash className="size-3.5 text-muted-foreground" />
												{t({ message: "Public" })}
											</span>
										</SelectItem>
										<SelectItem value="private">
											<span className="flex items-center gap-2">
												<LuLock className="size-3.5 text-muted-foreground" />
												{t({ message: "Private" })}
											</span>
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="flex flex-wrap gap-2">
								{onRename && (
									<Button size="sm" variant="outline" onClick={onRename}>
										<Trans>Rename</Trans>
									</Button>
								)}
								{onEditDescription && (
									<Button
										size="sm"
										variant="outline"
										onClick={onEditDescription}
									>
										<Trans>Edit goal</Trans>
									</Button>
								)}
							</div>
						</div>
					</PaneSection>
				)}

				{(membership || channel.canManage) && (
					<PaneSection title={<Trans>Membership</Trans>}>
						<div className="flex flex-wrap gap-2 px-2 py-1">
							{membership && (
								<Button size="sm" variant="outline" onClick={onLeave}>
									<Trans>Leave channel</Trans>
								</Button>
							)}
							{channel.canManage && (
								<Button size="sm" variant="destructive" onClick={onArchive}>
									<Trans>Archive channel</Trans>
								</Button>
							)}
						</div>
					</PaneSection>
				)}
			</div>
		</div>
	);
}
