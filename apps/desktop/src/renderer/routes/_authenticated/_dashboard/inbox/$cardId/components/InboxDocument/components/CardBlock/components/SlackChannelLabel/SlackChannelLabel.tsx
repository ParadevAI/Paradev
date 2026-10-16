import { Trans } from "@lingui/react/macro";
import { LuHash, LuLock } from "react-icons/lu";
import type { SlackConversationView } from "../../types";
import { StripeTag } from "../StripeTag";

interface SlackChannelLabelProps {
	channel: Pick<SlackConversationView, "kind" | "name" | "external">;
}

/** A channel as Slack names it: `#` or a lock for a private one, the name, and a mark when another organization shares it. */
export function SlackChannelLabel({ channel }: SlackChannelLabelProps) {
	const Icon = channel.kind === "private" ? LuLock : LuHash;
	return (
		<span className="inline-flex min-w-0 items-center gap-1 align-bottom">
			<Icon
				aria-hidden
				className="size-3.5 shrink-0 text-muted-foreground"
				data-channel-kind={channel.kind}
			/>
			<span className="truncate font-semibold text-foreground">
				{channel.name}
			</span>
			{channel.external && (
				<StripeTag tone="warn">
					<Trans>External</Trans>
				</StripeTag>
			)}
		</span>
	);
}
