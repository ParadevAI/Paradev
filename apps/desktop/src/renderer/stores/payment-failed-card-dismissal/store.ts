import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type PaymentFailedState = "past_due" | "lapsed";

interface PaymentFailedCardDismissalState {
	/** `<state>:<invoiceId>` of the last dismissed card. Only the latest matters. */
	dismissedKey: string | null;
	/** Not persisted: a card with no invoice id cannot be told apart from the next failure. */
	sessionDismissedState: PaymentFailedState | null;
	dismiss: (state: PaymentFailedState, invoiceId: string | null) => void;
}

export const usePaymentFailedCardDismissalStore =
	create<PaymentFailedCardDismissalState>()(
		devtools(
			persist(
				(set) => ({
					dismissedKey: null,
					sessionDismissedState: null,
					dismiss: (state, invoiceId) =>
						set(
							invoiceId
								? { dismissedKey: `${state}:${invoiceId}` }
								: { sessionDismissedState: state },
						),
				}),
				{
					name: "payment-failed-card-dismissal-v1",
					partialize: (s) => ({ dismissedKey: s.dismissedKey }),
				},
			),
			{ name: "PaymentFailedCardDismissal" },
		),
	);
