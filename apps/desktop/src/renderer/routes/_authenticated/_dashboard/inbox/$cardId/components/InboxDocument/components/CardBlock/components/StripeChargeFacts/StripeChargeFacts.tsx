import { useLingui } from "@lingui/react/macro";
import { LuExternalLink } from "react-icons/lu";
import { useStripeLabels } from "../../hooks/useStripeLabels";
import type { StripeChargeView } from "../../types";
import { stripeDate } from "../../utils/stripeDate";
import { stripeMoney } from "../../utils/stripeMoney";
import { StripeFacts } from "../StripeFacts";
import { StripeStatus } from "../StripeStatus";

interface StripeChargeFactsProps {
	charge: StripeChargeView;
}

/** The one charge a card is about: what was paid, when, for what, with which card, and what went back. */
export function StripeChargeFacts({ charge }: StripeChargeFactsProps) {
	const { t } = useLingui();
	const { cardLabel } = useStripeLabels();
	return (
		<StripeFacts
			rows={[
				{
					label: t({ message: "Charge", context: "a payment" }),
					value: (
						<span className="flex flex-wrap items-center gap-2">
							<a
								href={charge.url}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 font-medium tabular-nums underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
							>
								{stripeMoney(charge.amount, charge.currency)}
								<LuExternalLink className="size-3 opacity-60" />
							</a>
							<StripeStatus status={charge.status} />
						</span>
					),
				},
				{ label: t({ message: "Date" }), value: stripeDate(charge.created) },
				charge.description !== null && {
					label: t({ message: "Description" }),
					value: charge.description,
				},
				charge.card && {
					label: t({ message: "Card", context: "payment card" }),
					value: cardLabel(charge.card),
				},
				charge.refunded > 0 && {
					label: t({ message: "Already refunded" }),
					value: stripeMoney(charge.refunded, charge.currency),
				},
			]}
		/>
	);
}
