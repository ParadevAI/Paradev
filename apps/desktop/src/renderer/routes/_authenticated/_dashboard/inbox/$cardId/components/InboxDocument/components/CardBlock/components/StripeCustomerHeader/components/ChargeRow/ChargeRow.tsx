import { Trans, useLingui } from "@lingui/react/macro";
import { useStripeLabels } from "../../../../hooks/useStripeLabels";
import type { StripeChargeView } from "../../../../types";
import { stripeDate } from "../../../../utils/stripeDate";
import { stripeMoney } from "../../../../utils/stripeMoney";
import { StripeStatus } from "../../../StripeStatus";
import { StripeTag } from "../../../StripeTag";

interface ChargeRowProps {
	charge: StripeChargeView;
}

/** One past charge in the customer's list. */
export function ChargeRow({ charge }: ChargeRowProps) {
	const { t } = useLingui();
	const { cardLabel } = useStripeLabels();
	const refunded = stripeMoney(charge.refunded, charge.currency);
	return (
		<li className="flex flex-wrap items-center gap-x-3 gap-y-1">
			<a
				href={charge.url}
				target="_blank"
				rel="noreferrer"
				className="w-24 shrink-0 text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground"
			>
				{stripeDate(charge.created)}
			</a>
			<span className="font-medium tabular-nums text-foreground">
				{stripeMoney(charge.amount, charge.currency)}
			</span>
			<StripeStatus status={charge.status} />
			{charge.card && (
				<span className="text-muted-foreground">{cardLabel(charge.card)}</span>
			)}
			{charge.refunded > 0 && (
				<span className="text-muted-foreground">
					{charge.refunded === charge.amount
						? t({ message: "Refunded" })
						: t({ message: `Refunded ${refunded}` })}
				</span>
			)}
			{charge.disputed && (
				<StripeTag tone="bad">
					<Trans>Disputed</Trans>
				</StripeTag>
			)}
		</li>
	);
}
