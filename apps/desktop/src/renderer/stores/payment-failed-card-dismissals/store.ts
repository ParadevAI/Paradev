import { createDismissalsStore } from "renderer/stores/createDismissalsStore";

export const usePaymentFailedCardDismissalsStore = createDismissalsStore(
	"payment-failed-card-dismissals-v1",
	"PaymentFailedCardDismissals",
);
