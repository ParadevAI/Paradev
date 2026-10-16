import { Trans, useLingui } from "@lingui/react/macro";
import { LuX } from "react-icons/lu";
import type { SlackInviteeView } from "../../types";
import { SlackPersonRow } from "../SlackPersonRow";
import { StripeTag } from "../StripeTag";

interface SlackInviteeRowProps {
	invitee: SlackInviteeView;
	/** Absent where the reader cannot take the person off the list. */
	onRemove?: () => void;
	disabled?: boolean;
}

/** Someone a card adds to a channel: who they are, whether they are a guest, and whether they are in it already. The row says membership its own way, so the person row's "Not in channel" stays off. */
export function SlackInviteeRow({
	invitee,
	onRemove,
	disabled,
}: SlackInviteeRowProps) {
	const { t } = useLingui();
	const name = invitee.person.name;
	return (
		<div
			data-invitee={invitee.person.id}
			className="flex h-8 min-w-0 items-center gap-2 text-sm"
		>
			<SlackPersonRow person={{ ...invitee.person, inChannel: true }} />
			{invitee.guest && (
				<StripeTag tone="warn">
					<Trans>Guest</Trans>
				</StripeTag>
			)}
			{invitee.alreadyMember && (
				<span className="shrink-0 text-xs text-muted-foreground">
					<Trans>Already in this channel</Trans>
				</span>
			)}
			{onRemove && (
				<button
					type="button"
					disabled={disabled}
					aria-label={t({ message: `Remove ${name}` })}
					onClick={onRemove}
					className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-fill-hover hover:text-foreground disabled:opacity-50"
				>
					<LuX className="size-3.5" />
				</button>
			)}
		</div>
	);
}
