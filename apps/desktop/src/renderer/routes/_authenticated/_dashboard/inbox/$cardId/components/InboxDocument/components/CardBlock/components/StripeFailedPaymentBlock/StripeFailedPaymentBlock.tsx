import { Trans, useLingui } from "@lingui/react/macro";
import { Input } from "@superset/ui/input";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";
import { useStripeLabels } from "../../hooks/useStripeLabels";
import type { CardBlockViewProps } from "../../types";
import { stripeMoney } from "../../utils/stripeMoney";
import { ActionButton } from "../ActionButton";
import { StripeCustomerHeader } from "../StripeCustomerHeader";
import { StripeFacts } from "../StripeFacts";
import { StripeField } from "../StripeField";
import { StripeInvoiceSummary } from "../StripeInvoiceSummary";

const SUBJECT_MAX = 200;
const DRAFT_MAX = 8000;

/** An invoice whose payment failed: charge the customer again, or email them the link to pay with another card. */
export function StripeFailedPaymentBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"stripe.failed_payment">) {
	const { t } = useLingui();
	const { cardLabel, cardExpiry } = useStripeLabels();
	const { invoice, email } = view;
	const [subject, setSubject] = useState(email.subject);
	const [text, setText] = useState(email.draft);
	const action = (id: string) => actions.find((entry) => entry.id === id);
	const sendLink = action("send_link");
	const writing = pending || Boolean(sendLink?.disabled);
	const due = stripeMoney(invoice.amountRemaining, invoice.currency);
	const recipients = email.to ?? "";

	return (
		<div className="flex flex-col">
			<StripeCustomerHeader customer={view.customer} account={view.account} />
			<div className="flex flex-col gap-1.5 border-t border-border px-4 py-3">
				<StripeInvoiceSummary invoice={invoice} />
				<StripeFacts
					rows={[
						view.charged && {
							label: t({ message: "Payment method" }),
							value: (
								<span className="flex flex-wrap gap-x-3">
									<span>{cardLabel(view.charged)}</span>
									{cardExpiry(view.charged) && (
										<span className="tabular-nums">
											{cardExpiry(view.charged)}
										</span>
									)}
								</span>
							),
						},
					]}
				/>
			</div>
			{!done && sendLink && email.to && (
				<div className="flex flex-col gap-3 border-t border-border px-4 py-4">
					<div className="text-xs text-muted-foreground">
						<Trans>To {recipients}</Trans>
					</div>
					<StripeField label={<Trans>Subject</Trans>}>
						<Input
							value={subject}
							onChange={(event) => setSubject(event.target.value)}
							disabled={writing}
							maxLength={SUBJECT_MAX}
							aria-label={t({ message: "Subject" })}
							className="h-8 text-[13px] md:text-[13px]"
						/>
					</StripeField>
					<div className="flex flex-col rounded-md border border-input">
						<Textarea
							value={text}
							onChange={(event) => setText(event.target.value)}
							disabled={writing}
							maxLength={DRAFT_MAX}
							aria-label={t({ message: "Message" })}
							className="min-h-24 rounded-b-none border-0 text-[13px] shadow-none md:text-[13px]"
						/>
						{invoice.hostedUrl && (
							<a
								href={invoice.hostedUrl}
								target="_blank"
								rel="noreferrer"
								className="break-all px-3 pb-2 text-[13px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
							>
								{invoice.hostedUrl}
							</a>
						)}
					</div>
				</div>
			)}
			{failure && (
				<p role="alert" className="px-4 pb-3 text-xs text-destructive">
					{failure}
				</p>
			)}
			{!done && (
				<div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
					<ActionButton
						action={action("dismiss")}
						pending={pending}
						variant="outline"
						onClick={() => onAct("dismiss")}
					>
						<Trans>Leave it</Trans>
					</ActionButton>
					<ActionButton
						action={sendLink}
						pending={pending}
						variant="outline"
						disabled={!email.to || !subject.trim() || !text.trim()}
						confirmText={t({
							message: `Email the payment link for ${due} to ${recipients}?`,
						})}
						onClick={() =>
							onAct("send_link", { subject: subject.trim(), text: text.trim() })
						}
					>
						<Trans>Send update-card link</Trans>
					</ActionButton>
					<ActionButton
						action={action("retry")}
						pending={pending}
						onClick={() => onAct("retry")}
					>
						<Trans>Charge customer</Trans>
					</ActionButton>
				</div>
			)}
		</div>
	);
}
