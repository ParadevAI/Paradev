import { Trans, useLingui } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import { LuExternalLink } from "react-icons/lu";
import type { StripeInvoiceView } from "../../types";
import { stripeDate } from "../../utils/stripeDate";
import { stripeMoney, stripeMoneyWithCode } from "../../utils/stripeMoney";
import { StripeFacts } from "../StripeFacts";
import { StripeStatus } from "../StripeStatus";

interface StripeInvoiceSummaryProps {
	invoice: StripeInvoiceView;
}

/** An invoice as Stripe's invoice page sums it up: its lines, its totals, and how collecting it goes. */
export function StripeInvoiceSummary({ invoice }: StripeInvoiceSummaryProps) {
	const { t } = useLingui();
	const money = (amount: number) => stripeMoney(amount, invoice.currency);
	const total = "flex justify-between gap-6";
	return (
		<div className="flex flex-col gap-3 text-[13px] text-foreground">
			<div className="flex items-center gap-2">
				<span className="font-medium">
					{invoice.number ?? t({ message: "Draft", context: "invoice status" })}
				</span>
				<StripeStatus status={invoice.status} />
				<a
					href={invoice.url}
					target="_blank"
					rel="noreferrer"
					className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
				>
					<Trans>Open in Stripe</Trans>
					<LuExternalLink className="size-3" />
				</a>
			</div>
			<ul className="flex flex-col gap-1.5 border-y border-border py-2">
				{invoice.lines.map((line, i) => (
					<li
						// biome-ignore lint/suspicious/noArrayIndexKey: an invoice's lines never reorder
						key={i}
						className="flex justify-between gap-6"
					>
						<span className="min-w-0 break-words">{line.description}</span>
						<span className="shrink-0 tabular-nums">{money(line.amount)}</span>
					</li>
				))}
			</ul>
			<div className="flex flex-col gap-1.5 tabular-nums">
				<div className={total}>
					<span>
						<Trans>Total</Trans>
					</span>
					<span>{money(invoice.total)}</span>
				</div>
				<div className={total}>
					<span>
						<Trans>Amount paid</Trans>
					</span>
					<span>{money(invoice.amountPaid)}</span>
				</div>
				<div className={`${total} font-medium`}>
					<span>
						<Trans>Amount due</Trans>
					</span>
					<span>
						{stripeMoneyWithCode(invoice.amountRemaining, invoice.currency)}
					</span>
				</div>
			</div>
			<StripeFacts
				rows={[
					invoice.dueDate !== null && {
						label: t({ message: "Due date" }),
						value: stripeDate(invoice.dueDate),
					},
					invoice.attempts > 0 && {
						label: t({ message: "Payment attempts" }),
						value: formatNumber(invoice.attempts),
					},
					invoice.nextAttempt !== null && {
						label: t({ message: "Next attempt" }),
						value: stripeDate(invoice.nextAttempt),
					},
					invoice.lastError !== null && {
						label: t({ message: "Decline reason" }),
						value: (
							<span className="text-destructive">{invoice.lastError}</span>
						),
					},
				]}
			/>
		</div>
	);
}
