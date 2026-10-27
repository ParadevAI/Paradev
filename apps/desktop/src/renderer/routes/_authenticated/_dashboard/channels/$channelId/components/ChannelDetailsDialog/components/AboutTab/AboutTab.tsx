import { Trans, useLingui } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";
import {
	CHANNEL_DESCRIPTION_MAX_LENGTH,
	CHANNEL_NAME_MAX_LENGTH,
} from "@superset/shared/channels";
import type { RouterOutputs } from "@superset/trpc";
import { Button } from "@superset/ui/button";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { DetailRow } from "renderer/routes/_authenticated/_dashboard/components/DetailRow";
import type { ChannelPerson } from "../../../ChannelMessageRow";

type ChannelSummary = RouterOutputs["channel"]["get"];

interface AboutTabProps {
	channel: ChannelSummary;
	peopleById: Map<string, ChannelPerson>;
	onRename: (name: string) => void;
	onDescribe: (description: string) => void;
	onManageAdmins: () => void;
	onLeave: () => void;
}

export function AboutTab({
	channel,
	peopleById,
	onRename,
	onDescribe,
	onManageAdmins,
	onLeave,
}: AboutTabProps) {
	const { t } = useLingui();
	const { data: members = [] } = cloudTrpc.channel.members.useQuery({
		channelId: channel.id,
	});
	const admins = members.filter((member) => member.role === "admin");
	const creator = channel.createdByUserId
		? peopleById.get(channel.createdByUserId)
		: undefined;
	const created = formatDate(channel.createdAt, {
		month: "long",
		day: "numeric",
		year: "numeric",
	});
	const manage = channel.canManage;

	return (
		<div className="flex flex-col gap-4">
			<div className="overflow-hidden rounded-lg border border-border bg-background">
				<DetailRow
					label={<Trans>Channel name</Trans>}
					value={`# ${channel.name}`}
					editValue={channel.name}
					maxLength={CHANNEL_NAME_MAX_LENGTH}
					onSave={manage ? onRename : undefined}
				/>
			</div>
			<div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
				<DetailRow
					label={<Trans>Description</Trans>}
					value={
						channel.description || (
							<span className="text-muted-foreground">
								{t({ message: "Add a description" })}
							</span>
						)
					}
					editValue={channel.description ?? ""}
					maxLength={CHANNEL_DESCRIPTION_MAX_LENGTH}
					onSave={manage ? onDescribe : undefined}
				/>
				<DetailRow
					label={<Trans>Managed by</Trans>}
					value={admins.map((admin) => admin.name).join(", ")}
					onEdit={manage ? onManageAdmins : undefined}
				/>
				<DetailRow
					label={<Trans>Created by</Trans>}
					value={
						creator ? (
							<Trans>
								{creator.name} on {created}
							</Trans>
						) : (
							created
						)
					}
				/>
				{channel.membership && (
					<div className="px-4 py-3">
						<Button
							size="sm"
							variant="ghost"
							onClick={onLeave}
							className="-ml-2 text-destructive hover:text-destructive"
						>
							<Trans>Leave channel</Trans>
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
