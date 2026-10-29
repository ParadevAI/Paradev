import { Trans } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";
import type { RouterOutputs } from "@superset/trpc";
import { LuHash, LuLock, LuPencil, LuUserPlus } from "react-icons/lu";
import type { ChannelPerson } from "../../../ChannelMessageRow";
import { IntroAction } from "./components/IntroAction";

type ChannelSummary = RouterOutputs["channel"]["get"];

interface ChannelIntroProps {
	channel: ChannelSummary;
	creator: ChannelPerson | null;
	isCreator: boolean;
	onAddPeople?: () => void;
	onEditDescription?: () => void;
	onRename?: () => void;
}

/** The top of a channel's history, as Slack draws it. */
export function ChannelIntro({
	channel,
	creator,
	isCreator,
	onAddPeople,
	onEditDescription,
	onRename,
}: ChannelIntroProps) {
	const Icon = channel.visibility === "private" ? LuLock : LuHash;
	const created = formatDate(channel.createdAt, {
		month: "long",
		day: "numeric",
	});
	const name = (
		<span className="inline-flex items-baseline font-semibold text-foreground">
			<Icon className="mr-0.5 size-3.5 self-center" />
			{channel.name}
		</span>
	);
	return (
		<div className="flex flex-col gap-2 px-4 pt-10 pb-4">
			<h2 className="flex items-center gap-1 text-[26px] font-bold">
				<Icon className="size-6 shrink-0" />
				<span className="truncate">{channel.name}</span>
			</h2>
			{channel.description && (
				<p className="text-[15px] text-foreground">{channel.description}</p>
			)}
			<p className="text-[15px] text-muted-foreground">
				{isCreator ? (
					<Trans>You created this channel on {created}.</Trans>
				) : creator ? (
					<Trans>
						{creator.name} created this channel on {created}.
					</Trans>
				) : null}{" "}
				<Trans>This is the very beginning of the {name} channel.</Trans>
			</p>
			{(onAddPeople || onEditDescription || onRename) && (
				<div className="mt-2 flex flex-wrap gap-2">
					{onAddPeople && (
						<IntroAction icon={<LuUserPlus />} onClick={onAddPeople}>
							<Trans>Add People to Channel</Trans>
						</IntroAction>
					)}
					{onEditDescription && (
						<IntroAction icon={<LuPencil />} onClick={onEditDescription}>
							{channel.description ? (
								<Trans>Edit Description</Trans>
							) : (
								<Trans>Add Description</Trans>
							)}
						</IntroAction>
					)}
					{onRename && (
						<IntroAction icon={<LuPencil />} onClick={onRename}>
							<Trans>Edit Channel Name</Trans>
						</IntroAction>
					)}
				</div>
			)}
		</div>
	);
}
