import { useLingui } from "@lingui/react/macro";
import { isPaidPlanTier } from "@superset/shared/billing";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert } from "react-native";
import { useSession } from "@/lib/auth/client";
import { openUrl } from "@/lib/open-url";
import { billingSettingsUrl, webHost } from "@/lib/web-links";
import { billingAccess, billingMode } from "../billingMode";
import { proCheckoutUrl } from "../checkout";

const BILLING_MODE_QUERY_KEY = ["billing-mode"] as const;

/**
 * What this build may offer for billing, and the links it may open. Until the
 * mode is known, and when it fails, nothing links and no host is named.
 */
export function useUpgrade() {
	const { t } = useLingui();
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;

	const mode = useQuery({
		queryKey: BILLING_MODE_QUERY_KEY,
		queryFn: () => billingMode(),
		networkMode: "always",
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
		retry: false,
	});
	const access = billingAccess(mode.data ?? "none", {
		isOwner: session?.session?.role === "owner" && organizationId !== null,
		isPaid: isPaidPlanTier(session?.session?.plan),
		host: webHost(),
	});

	const checkout = useMutation({
		mutationFn: () => proCheckoutUrl(organizationId as string),
		onSuccess: openUrl,
		onError: () =>
			Alert.alert(
				t({ message: "Could not start checkout. Please try again." }),
			),
	});

	return {
		/** False until the mode is known, so a caller does not count a paywall that is about to show a link. */
		isResolved: !mode.isPending,
		...access,
		upgrade: () => {
			if (access.canUpgrade) checkout.mutate();
		},
		isUpgrading: checkout.isPending,
		openBillingSettings: () => {
			if (access.canManagePlan) openUrl(billingSettingsUrl(organizationId));
		},
	};
}
