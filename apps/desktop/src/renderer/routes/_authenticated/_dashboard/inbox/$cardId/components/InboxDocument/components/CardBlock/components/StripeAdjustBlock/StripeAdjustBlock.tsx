import { Trans, useLingui } from "@lingui/react/macro";
import { Input } from "@superset/ui/input";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";
import { useNow } from "renderer/hooks/useNow";
import { useStripeLabels } from "../../hooks/useStripeLabels";
import type { CardBlockViewProps } from "../../types";
import {
	addLocalDays,
	localDaysUntil,
	startOfLocalDay,
	stripeDate,
} from "../../utils/stripeDate";
import {
	moneyInputText,
	parseMoneyInput,
	stripeMoney,
} from "../../utils/stripeMoney";
import { ActionButton } from "../ActionButton";
import { StripeCustomerHeader } from "../StripeCustomerHeader";
import { StripeFacts } from "../StripeFacts";
import { StripeField } from "../StripeField";
import { StripeMoneyField } from "../StripeMoneyField";
import { StripeSelect } from "../StripeSelect";
import { CouponList } from "./components/CouponList";

const NOW_TICK_MS = 60_000;
const NOTE_MAX = 350;
const CREDIT_MAX = 100_000_00;

/** One change to a customer's account the agent proposes: a coupon, a credit, or a longer trial. */
export function StripeAdjustBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"stripe.adjust">) {
	const { t } = useLingui();
	const now = useNow(NOW_TICK_MS);
	const { customerName, couponTerms, balanceLabel, amountError } =
		useStripeLabels();
	const { customer, proposed } = view;
	const { subscriptions } = customer;
	const action = (id: string) => actions.find((entry) => entry.id === id);

	const [targetId, setTargetId] = useState(
		view.subscription?.id ?? subscriptions[0]?.id ?? "",
	);
	const target =
		subscriptions.find((subscription) => subscription.id === targetId) ??
		view.subscription;
	const [couponId, setCouponId] = useState(
		proposed.coupon ?? view.coupons[0]?.id ?? "",
	);
	const coupon = view.coupons.find((entry) => entry.id === couponId);
	const currency = proposed.credit?.currency ?? customer.credit.currency;
	const [creditText, setCreditText] = useState(() =>
		proposed.credit ? moneyInputText(proposed.credit.amount, currency) : "",
	);
	const [direction, setDirection] = useState(proposed.direction);
	const [note, setNote] = useState(proposed.note);
	const [daysText, setDaysText] = useState(() => {
		const end =
			proposed.trialEnd ?? target?.trialEnd ?? target?.currentPeriodEnd;
		return String(end ? localDaysUntil(new Date(), end) : 1);
	});

	const who = customerName(customer);
	const product = target?.product ?? "";
	const withTarget = target ? { subscription: target.id } : {};

	const terms = coupon ? couponTerms(coupon) : "";
	const credit = parseMoneyInput(creditText, currency);
	const creditValid = credit !== null && credit > 0 && credit <= CREDIT_MAX;
	const crediting = stripeMoney(credit ?? 0, currency);
	const held = customer.credit.amount;
	const newBalance = creditValid
		? balanceLabel(held + (direction === "debit" ? -credit : credit), currency)
		: "—";
	const days = /^\d+$/.test(daysText.trim()) ? Number(daysText) : null;
	const trialEnd =
		days === null
			? null
			: proposed.trialEnd && days === localDaysUntil(now, proposed.trialEnd)
				? proposed.trialEnd
				: startOfLocalDay(addLocalDays(now, days));
	const trialValid =
		trialEnd !== null &&
		days !== null &&
		days >= 1 &&
		Date.parse(trialEnd) > now.getTime();
	const trialDate = trialEnd ? stripeDate(trialEnd) : "";

	const targetField = subscriptions.length > 1 && (
		<StripeField label={<Trans>Subscription</Trans>}>
			<StripeSelect
				label={t({ message: "Subscription" })}
				value={targetId}
				onChange={setTargetId}
				disabled={pending}
				options={subscriptions.map((subscription) => ({
					value: subscription.id,
					label: subscription.product,
				}))}
			/>
		</StripeField>
	);

	return (
		<div className="flex flex-col">
			<StripeCustomerHeader customer={customer} account={view.account} />
			{!done && view.adjust === "coupon" && (
				<div className="flex flex-col gap-4 border-t border-border px-4 py-4">
					<StripeField label={<Trans>Coupon</Trans>}>
						<CouponList
							coupons={view.coupons}
							value={couponId}
							onChange={setCouponId}
							disabled={pending}
						/>
					</StripeField>
					{targetField}
				</div>
			)}
			{!done && view.adjust === "credit" && (
				<div className="flex flex-col gap-4 border-t border-border px-4 py-4">
					<StripeFacts
						rows={[
							{
								label: t({ message: "Starting balance" }),
								value: balanceLabel(held, currency),
							},
							{ label: t({ message: "New balance" }), value: newBalance },
						]}
					/>
					<StripeField label={<Trans>Adjustment type</Trans>}>
						<StripeSelect
							label={t({ message: "Adjustment type" })}
							value={direction}
							onChange={setDirection}
							disabled={pending}
							options={[
								{
									value: "credit",
									label: t({
										message: "Credit",
										context: "balance adjustment type",
									}),
								},
								{
									value: "debit",
									label: t({
										message: "Debit",
										context: "balance adjustment type",
									}),
								},
							]}
						/>
					</StripeField>
					<StripeField
						label={<Trans context="money to adjust a balance by">Amount</Trans>}
					>
						<StripeMoneyField
							label={t({
								message: "Amount",
								context: "money to adjust a balance by",
							})}
							value={creditText}
							onChange={setCreditText}
							currency={currency}
							disabled={pending}
							invalid={!creditValid}
							error={amountError(creditText, currency, CREDIT_MAX)}
						/>
					</StripeField>
					<StripeField label={<Trans>Add internal note</Trans>}>
						<Textarea
							value={note}
							onChange={(event) => setNote(event.target.value)}
							disabled={pending}
							maxLength={NOTE_MAX}
							aria-label={t({ message: "Add internal note" })}
							className="min-h-16 text-[13px] md:text-[13px]"
						/>
					</StripeField>
				</div>
			)}
			{!done && view.adjust === "trial" && (
				<div className="flex flex-col gap-4 border-t border-border px-4 py-4">
					{targetField}
					<StripeFacts
						rows={[
							{
								label: t({ message: "Current trial end" }),
								value: target?.trialEnd
									? stripeDate(target.trialEnd)
									: t({ message: "No trial" }),
							},
						]}
					/>
					<StripeField label={<Trans>Free trial days</Trans>}>
						<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
							<Input
								type="number"
								min={1}
								value={daysText}
								onChange={(event) => setDaysText(event.target.value)}
								disabled={pending}
								aria-label={t({ message: "Free trial days" })}
								aria-invalid={!trialValid || undefined}
								className="h-8 w-20 text-[13px] tabular-nums md:text-[13px]"
							/>
							{trialEnd && (
								<span className="text-xs text-muted-foreground">
									<Trans>Ends {trialDate}</Trans>
								</span>
							)}
						</div>
					</StripeField>
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
						<Trans>Keep as is</Trans>
					</ActionButton>
					<ActionButton
						action={action("coupon")}
						pending={pending}
						disabled={!coupon}
						confirmText={t({
							message: `Apply ${terms} to ${who}'s ${product} subscription?`,
						})}
						onClick={() => onAct("coupon", { coupon: couponId, ...withTarget })}
					>
						<Trans>Apply coupon</Trans>
					</ActionButton>
					<ActionButton
						action={action("credit")}
						pending={pending}
						disabled={!creditValid}
						confirmText={
							direction === "debit"
								? t({
										message: `Debit ${crediting} from ${who}'s credit balance?`,
									})
								: t({ message: `Add ${crediting} credit to ${who}'s balance?` })
						}
						onClick={() =>
							onAct("credit", {
								amount: credit,
								direction,
								...(note.trim() ? { note: note.trim() } : {}),
							})
						}
					>
						{action("credit")?.label}
					</ActionButton>
					<ActionButton
						action={action("trial")}
						pending={pending}
						disabled={!trialValid}
						confirmText={t({
							message: `Extend ${who}'s trial of ${product} to ${trialDate}?`,
						})}
						onClick={() => onAct("trial", { trialEnd, ...withTarget })}
					>
						<Trans>Extend trial</Trans>
					</ActionButton>
				</div>
			)}
		</div>
	);
}
