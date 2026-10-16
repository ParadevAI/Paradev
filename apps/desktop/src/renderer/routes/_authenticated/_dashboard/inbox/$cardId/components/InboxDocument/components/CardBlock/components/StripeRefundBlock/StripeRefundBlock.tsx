import { Trans, useLingui } from "@lingui/react/macro";
import { formatList } from "@superset/i18n/format";
import { Checkbox } from "@superset/ui/checkbox";
import { useId, useState } from "react";
import { useStripeLabels } from "../../hooks/useStripeLabels";
import type { CardBlockViewProps, StripeRefundReason } from "../../types";
import {
	moneyInputText,
	parseMoneyInput,
	stripeMoney,
} from "../../utils/stripeMoney";
import { ActionButton } from "../ActionButton";
import { StripeChargeFacts } from "../StripeChargeFacts";
import { StripeCustomerHeader } from "../StripeCustomerHeader";
import { StripeField } from "../StripeField";
import { StripeMoneyField } from "../StripeMoneyField";
import { StripeSelect } from "../StripeSelect";
import { RequestEmail } from "./components/RequestEmail";

/** Stripe's "Refund payment" dialog on a charge the agent wants refunded: how much, why, and what goes with it. */
export function StripeRefundBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"stripe.refund">) {
	const { t } = useLingui();
	const id = useId();
	const { cardLabel, customerName, amountError } = useStripeLabels();
	const { charge, customer, email } = view;
	const { currency } = charge;
	const [amountText, setAmountText] = useState(() =>
		moneyInputText(view.proposed.amount, currency),
	);
	const [reason, setReason] = useState<StripeRefundReason | "">(
		view.proposed.reason ?? "",
	);
	const [cancel, setCancel] = useState(view.proposed.cancel);
	const [reply, setReply] = useState(email?.draft ?? "");
	const action = (id: string) => actions.find((entry) => entry.id === id);

	const amount = parseMoneyInput(amountText, currency);
	const valid = amount !== null && amount > 0 && amount <= view.refundable;
	const cancellable = (customer?.subscriptions ?? []).filter(
		(subscription) => subscription.status !== "canceled",
	);
	const cancelled = cancellable.find(
		(subscription) => subscription.id === cancel,
	);
	const replyText = email?.canReply ? reply.trim() : "";
	const blocking = reason === "fraudulent";

	const refundable = stripeMoney(view.refundable, currency);
	const refunding = stripeMoney(amount ?? 0, currency);
	const charged = stripeMoney(charge.amount, currency);
	const who = customerName(customer);
	const card = cardLabel(charge.card);
	const product = cancelled?.product ?? "";
	const recipients = formatList(email?.replyTo ?? []);
	const confirmText = [
		t({
			message: `Refund ${refunding} of the ${charged} charge to ${who}'s ${card}?`,
		}),
		blocking &&
			t({
				message: "The payment method and email are added to your block lists.",
			}),
		cancelled && t({ message: `The ${product} subscription is canceled now.` }),
		replyText && t({ message: `A reply is sent to ${recipients}.` }),
	]
		.filter(Boolean)
		.join(" ");

	return (
		<div className="flex flex-col">
			<StripeCustomerHeader customer={customer} account={view.account} />
			<div className="border-t border-border px-4 py-3">
				<StripeChargeFacts charge={charge} />
			</div>
			{!done && view.refundable > 0 && (
				<div className="flex flex-col gap-4 border-t border-border px-4 py-4">
					<StripeField label={<Trans>Refund amount</Trans>}>
						<div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
							<StripeMoneyField
								label={t({ message: "Refund amount" })}
								value={amountText}
								onChange={setAmountText}
								currency={currency}
								disabled={pending}
								invalid={!valid}
								error={amountError(amountText, currency, view.refundable)}
							/>
							<span className="flex h-8 items-center text-xs text-muted-foreground">
								<Trans>of {refundable} refundable</Trans>
							</span>
							<button
								type="button"
								disabled={pending}
								onClick={() =>
									setAmountText(moneyInputText(view.refundable, currency))
								}
								className="h-8 text-xs text-foreground underline underline-offset-2 disabled:opacity-50"
							>
								<Trans>Refund full amount</Trans>
							</button>
						</div>
					</StripeField>
					<StripeField label={<Trans>Reason</Trans>}>
						<StripeSelect
							label={t({ message: "Reason" })}
							value={reason}
							onChange={setReason}
							disabled={pending}
							options={[
								{ value: "", label: t({ message: "Select a reason" }) },
								{ value: "duplicate", label: t({ message: "Duplicate" }) },
								{ value: "fraudulent", label: t({ message: "Fraudulent" }) },
								{
									value: "requested_by_customer",
									label: t({ message: "Requested by customer" }),
								},
								{
									value: "other",
									label: t({ message: "Other", context: "refund reason" }),
								},
							]}
						/>
						{blocking && (
							<p className="text-xs text-muted-foreground">
								<Trans>
									Marking this payment as fraudulent adds the associated payment
									method and email to your block lists. Stripe uses this data to
									block similar payments and improve our fraud detection.
								</Trans>
							</p>
						)}
					</StripeField>
					{cancellable.length > 0 && (
						<div className="flex flex-col gap-2">
							{cancellable.map((subscription) => {
								const name = subscription.product;
								return (
									<div
										key={subscription.id}
										className="flex items-center gap-2 text-[13px] text-foreground"
									>
										<Checkbox
											id={`${id}-${subscription.id}`}
											checked={cancel === subscription.id}
											disabled={pending}
											onCheckedChange={(checked) =>
												setCancel(checked === true ? subscription.id : null)
											}
											aria-label={t({ message: `Also cancel ${name}` })}
										/>
										<label htmlFor={`${id}-${subscription.id}`}>
											<Trans>Also cancel {name}</Trans>
										</label>
									</div>
								);
							})}
						</div>
					)}
				</div>
			)}
			{email && (
				<div className="border-t border-border px-4 py-3">
					<RequestEmail
						email={email}
						customerEmail={customer?.email ?? null}
						reply={reply}
						onReply={setReply}
						replying={!done}
						disabled={pending}
					/>
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
						<Trans>Do not refund</Trans>
					</ActionButton>
					<ActionButton
						action={action("refund")}
						pending={pending}
						disabled={!valid}
						confirmText={confirmText}
						onClick={() =>
							onAct("refund", {
								amount,
								reason: reason || null,
								cancel: cancelled?.id ?? null,
								reply:
									email && replyText
										? { text: replyText, version: email.version }
										: null,
							})
						}
					>
						{blocking ? <Trans>Refund and block</Trans> : <Trans>Refund</Trans>}
					</ActionButton>
				</div>
			)}
		</div>
	);
}
