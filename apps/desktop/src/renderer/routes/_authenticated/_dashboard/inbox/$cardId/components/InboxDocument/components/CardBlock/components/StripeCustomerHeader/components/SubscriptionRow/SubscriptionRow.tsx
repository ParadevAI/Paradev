import { useLingui } from "@lingui/react/macro";
import { useStripeLabels } from "../../../../hooks/useStripeLabels";
import type { StripeSubscriptionView } from "../../../../types";
import { stripeDate } from "../../../../utils/stripeDate";
import { StripeStatus } from "../../../StripeStatus";
import { StripeTag } from "../../../StripeTag";

interface SubscriptionRowProps {
	subscription: StripeSubscriptionView;
}

/** One subscription: the product, its price, its status and the next date that matters. */
export function SubscriptionRow({ subscription }: SubscriptionRowProps) {
	const { t } = useLingui();
	const { priceLabel, pausedLabel } = useStripeLabels();
	const { quantity, product } = subscription;
	const more = subscription.items - 1;
	const price = priceLabel(subscription.price);
	const ends = subscription.cancelAt ?? subscription.currentPeriodEnd;
	const cancels = stripeDate(ends);
	const trialEnds = subscription.trialEnd
		? stripeDate(subscription.trialEnd)
		: "";
	const renews = stripeDate(subscription.currentPeriodEnd);
	const next =
		subscription.status === "canceled"
			? null
			: subscription.cancelAt || subscription.cancelAtPeriodEnd
				? t({ message: `Cancels ${cancels}` })
				: subscription.status === "trialing" && subscription.trialEnd
					? t({ message: `Trial ends ${trialEnds}` })
					: t({ message: `Renews ${renews}` });
	return (
		<li className="flex flex-wrap items-center gap-x-3 gap-y-1">
			<a
				href={subscription.url}
				target="_blank"
				rel="noreferrer"
				className="font-medium text-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
			>
				{more > 0 ? t({ message: `${product} +${more} more` }) : product}
			</a>
			<span className="tabular-nums text-foreground">
				{!subscription.metered
					? price
					: subscription.price.amount === 0
						? t({ message: "Usage-based" })
						: t({ message: `${price} + usage` })}
				{quantity > 1 && ` × ${quantity}`}
			</span>
			<StripeStatus status={subscription.status} />
			{subscription.paused && (
				<StripeTag tone="warn">{pausedLabel(subscription.paused)}</StripeTag>
			)}
			{next && <span className="text-muted-foreground">{next}</span>}
		</li>
	);
}
