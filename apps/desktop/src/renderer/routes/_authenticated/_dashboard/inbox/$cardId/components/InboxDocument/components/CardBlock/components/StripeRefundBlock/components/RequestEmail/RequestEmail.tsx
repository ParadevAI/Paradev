import { Trans, useLingui } from "@lingui/react/macro";
import { formatList } from "@superset/i18n/format";
import { Textarea } from "@superset/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuExternalLink } from "react-icons/lu";
import type { StripeEmailView } from "../../../../types";
import { StripeTag } from "../../../StripeTag";

const REPLY_MAX = 8000;

interface RequestEmailProps {
	email: StripeEmailView;
	/** The customer's address in Stripe, named when the email is from another one. */
	customerEmail: string | null;
	reply: string;
	onReply: (reply: string) => void;
	/** False once the card is settled: the request stays, the reply box goes. */
	replying: boolean;
	disabled: boolean;
}

/** The email the refund was asked for in, and the reply that goes back with the refund. */
export function RequestEmail({
	email,
	customerEmail,
	reply,
	onReply,
	replying,
	disabled,
}: RequestEmailProps) {
	const { t } = useLingui();
	const recipients = formatList(email.replyTo);
	const label = t({ message: "Reply", context: "the text of a reply email" });
	const box = (
		<Textarea
			value={reply}
			onChange={(event) => onReply(event.target.value)}
			disabled={disabled || !email.canReply}
			maxLength={REPLY_MAX}
			aria-label={label}
			placeholder={label}
			className="min-h-24 text-[13px] md:text-[13px]"
		/>
	);
	return (
		<div className="flex flex-col gap-2 text-[13px]">
			<div className="flex items-baseline gap-2">
				<span className="min-w-0 flex-1 truncate font-medium text-foreground">
					{email.subject ?? t({ message: "(no subject)" })}
				</span>
				{email.url && (
					<a
						href={email.url}
						target="_blank"
						rel="noreferrer"
						className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
					>
						<Trans>Open in Gmail</Trans>
						<LuExternalLink className="size-3" />
					</a>
				)}
			</div>
			<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				{email.from}
				{!email.fromCustomer && (
					<StripeTag tone="warn">
						{customerEmail ? (
							<Trans>Not from {customerEmail}</Trans>
						) : (
							<Trans>Not from the customer</Trans>
						)}
					</StripeTag>
				)}
			</div>
			<p className="text-foreground">{email.snippet}</p>
			{replying && (
				<>
					<div className="text-xs text-muted-foreground">
						<Trans>To {recipients}</Trans>
					</div>
					{email.canReply ? (
						box
					) : (
						<Tooltip>
							<TooltipTrigger asChild>
								<span>{box}</span>
							</TooltipTrigger>
							<TooltipContent side="top">
								<Trans>Connect Gmail to send a reply</Trans>
							</TooltipContent>
						</Tooltip>
					)}
				</>
			)}
		</div>
	);
}
