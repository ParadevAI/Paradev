import { LuArrowRight } from "react-icons/lu";
import type { SlackRequestView } from "../../../../types";
import { SlackChannelLabel } from "../../../SlackChannelLabel";
import { SlackInviteeRow } from "../../../SlackInviteeRow";

interface GrantRowProps {
	grant: NonNullable<SlackRequestView["grant"]>;
}

/** What approving does besides the reply: this person goes into this channel. */
export function GrantRow({ grant }: GrantRowProps) {
	return (
		<div
			data-grant
			className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-md border border-border px-3 py-1.5 text-[13px]"
		>
			<SlackInviteeRow invitee={grant} />
			<LuArrowRight
				aria-hidden
				className="size-3.5 shrink-0 text-muted-foreground"
			/>
			<SlackChannelLabel channel={grant.channel} />
		</div>
	);
}
