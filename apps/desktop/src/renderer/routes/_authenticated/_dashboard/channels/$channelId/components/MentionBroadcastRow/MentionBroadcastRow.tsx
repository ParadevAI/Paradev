import { Trans } from "@lingui/react/macro";
import type { ChannelBroadcast } from "@superset/shared/channels";
import { LuMegaphone } from "react-icons/lu";

interface MentionBroadcastRowProps {
	broadcast: ChannelBroadcast;
}

/** @here, @channel or @everyone in the @ menu, with Slack's description. */
export function MentionBroadcastRow({ broadcast }: MentionBroadcastRowProps) {
	return (
		<>
			<span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
				<LuMegaphone className="size-4" />
			</span>
			<span className="shrink-0 font-semibold">@{broadcast}</span>
			<span className="min-w-0 truncate text-muted-foreground">
				{broadcast === "here" ? (
					<Trans>Notify every online member in this channel</Trans>
				) : (
					<Trans>Notify everyone in this channel</Trans>
				)}
			</span>
		</>
	);
}
