import type { InboxTone } from "renderer/routes/_authenticated/_dashboard/utils/inboxTone";
import { useStripeLabels } from "../../hooks/useStripeLabels";
import { StripeTag } from "../StripeTag";

type Tone = Exclude<InboxTone, "done">;

const TONES: Record<string, Tone> = {
	active: "good",
	succeeded: "good",
	paid: "good",
	won: "good",
	trialing: "warn",
	past_due: "warn",
	pending: "warn",
	open: "warn",
	incomplete: "warn",
	needs_response: "warn",
	warning_needs_response: "warn",
	failed: "bad",
	unpaid: "bad",
	uncollectible: "bad",
	lost: "bad",
};

interface StripeStatusProps {
	/** The status of a charge, a subscription, an invoice or a dispute, as Stripe names it. */
	status: string;
}

export function StripeStatus({ status }: StripeStatusProps) {
	const { statusLabel } = useStripeLabels();
	return (
		<StripeTag tone={TONES[status] ?? "neutral"}>
			{statusLabel(status)}
		</StripeTag>
	);
}
