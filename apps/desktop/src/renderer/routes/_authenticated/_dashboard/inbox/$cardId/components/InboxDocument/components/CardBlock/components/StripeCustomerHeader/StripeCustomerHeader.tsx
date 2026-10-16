import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { LuExternalLink } from "react-icons/lu";
import { useStripeLabels } from "../../hooks/useStripeLabels";
import type { StripeAccountView, StripeCustomerView } from "../../types";
import { stripeMoney } from "../../utils/stripeMoney";
import { LetterAvatar } from "../LetterAvatar";
import { StripeFacts } from "../StripeFacts";
import { StripeTag } from "../StripeTag";
import { ChargeRow } from "./components/ChargeRow";
import { SubscriptionRow } from "./components/SubscriptionRow";

const CHARGES_SHOWN = 3;

interface StripeCustomerHeaderProps {
	/** Null for a charge with no customer. */
	customer: StripeCustomerView | null;
	account: StripeAccountView;
}

/** Who the customer is and what they have paid, as Stripe's customer panel shows it. */
export function StripeCustomerHeader({
	customer,
	account,
}: StripeCustomerHeaderProps) {
	const { t } = useLingui();
	const { cardLabel } = useStripeLabels();
	const [allCharges, setAllCharges] = useState(false);
	const charges = customer?.charges ?? [];
	const shown = allCharges ? charges : charges.slice(0, CHARGES_SHOWN);
	const heading =
		"text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

	return (
		<div className="flex flex-col gap-3 px-4 py-3 text-[13px]">
			{account.writesOff && (
				<p
					role="alert"
					className="rounded-md bg-warning/10 px-3 py-2 text-xs text-foreground"
				>
					{account.writesOff}
				</p>
			)}
			{customer ? (
				<>
					<div className="flex items-center gap-2.5">
						<LetterAvatar
							address={{
								name: customer.name,
								email: customer.email ?? customer.id,
							}}
							className="size-8 text-sm"
						/>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<span className="truncate font-medium text-foreground">
									{customer.name ?? customer.email ?? customer.id}
								</span>
								{customer.delinquent && (
									<StripeTag tone="bad">
										<Trans>Delinquent</Trans>
									</StripeTag>
								)}
							</div>
							{customer.name && customer.email && (
								<div className="truncate text-xs text-muted-foreground">
									{customer.email}
								</div>
							)}
						</div>
						<a
							href={customer.url}
							target="_blank"
							rel="noreferrer"
							className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
						>
							<Trans>Open in Stripe</Trans>
							<LuExternalLink className="size-3" />
						</a>
					</div>
					<StripeFacts
						rows={[
							{
								label: t({ message: "Card", context: "payment card" }),
								value: customer.card
									? cardLabel(customer.card)
									: t({ message: "No card on file" }),
							},
							{
								label: t({
									message: "Paid",
									context: "what a customer has paid in total",
								}),
								value: `${stripeMoney(customer.spent.amount, customer.spent.currency)}${customer.spentPartial ? "+" : ""}`,
							},
							customer.credit.amount !== 0 && {
								label: t({ message: "Credit balance" }),
								value: stripeMoney(
									customer.credit.amount,
									customer.credit.currency,
								),
							},
						]}
					/>
					{customer.subscriptions.length > 0 && (
						<div className="flex flex-col gap-1.5">
							<div className={heading}>
								<Trans>Subscriptions</Trans>
							</div>
							<ul className="flex flex-col gap-1.5">
								{customer.subscriptions.map((subscription) => (
									<SubscriptionRow
										key={subscription.id}
										subscription={subscription}
									/>
								))}
							</ul>
						</div>
					)}
					{charges.length > 0 && (
						<div className="flex flex-col gap-1.5">
							<div className={heading}>
								<Trans>Payments</Trans>
							</div>
							<ul className="flex flex-col gap-1.5">
								{shown.map((charge) => (
									<ChargeRow key={charge.id} charge={charge} />
								))}
							</ul>
							{charges.length > CHARGES_SHOWN && (
								<button
									type="button"
									onClick={() => setAllCharges((all) => !all)}
									className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
								>
									{allCharges ? (
										<Trans>Show fewer</Trans>
									) : (
										<Trans>Show all</Trans>
									)}
								</button>
							)}
						</div>
					)}
				</>
			) : (
				<p className="font-medium text-foreground">
					<Trans>Guest customer</Trans>
				</p>
			)}
		</div>
	);
}
