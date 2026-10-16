import { Plural } from "@lingui/react/macro";
import type { ReactNode } from "react";
import type { SlackChannelView } from "../../../../types";
import { SlackOpenLink } from "../../../SlackOpenLink";

interface ChannelFactsProps {
	channel: NonNullable<SlackChannelView["channel"]>;
	/** The dialog's title, which names the channel. */
	children: ReactNode;
}

/** The head of a dialog about one channel: its title, how many people are in it, and the way to it. */
export function ChannelFacts({ channel, children }: ChannelFactsProps) {
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-foreground">
			<span className="flex min-w-0 items-center gap-1.5 font-medium">
				{children}
			</span>
			{channel.members !== null && (
				<span className="text-xs text-muted-foreground">
					<Plural value={channel.members} one="# member" other="# members" />
				</span>
			)}
			<span className="flex-1" />
			{channel.url && <SlackOpenLink href={channel.url} />}
		</div>
	);
}
