import { createDismissalsStore } from "renderer/stores/createDismissalsStore";

/** Dismissals for the setup-script card, keyed by projectId. */
export const useV2SetupCardDismissalsStore = createDismissalsStore(
	"v2-setup-card-dismissals-v1",
	"V2SetupCardDismissals",
);
