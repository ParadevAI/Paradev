import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

type PaymentFailedState = "past_due" | "lapsed";

interface PaymentFailedCardDismissalState {
	/** `<state>:<invoiceId>` of the last dismissed card. Only the latest matters. */
	dismissedKey: string | null;
	/** Not persisted: a card with no invoice id cannot be told apart from the next failure. */
	sessionDismissedState: PaymentFailedState | null;
	isDismissed: (state: PaymentFailedState, invoiceId: string | null) => boolean;
	dismiss: (state: PaymentFailedState, invoiceId: string | null) => void;
}

export const usePaymentFailedCardDismissalStore =
	create<PaymentFailedCardDismissalState>()(
		devtools(
			persist(
				(set, get) => ({
					dismissedKey: null,
					sessionDismissedState: null,
					isDismissed: (state, invoiceId) =>
						invoiceId
							? get().dismissedKey === `${state}:${invoiceId}`
							: get().sessionDismissedState === state,
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
