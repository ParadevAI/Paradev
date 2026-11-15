import { useLingui } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert } from "react-native";
import { useSession } from "@/lib/auth/client";
import { openUrl } from "@/lib/open-url";
import { billingLinksAllowed } from "../billingLinksAllowed";
import { billingSettingsUrl, proCheckoutUrl } from "../checkout";

const BILLING_LINKS_QUERY_KEY = ["billing-links-allowed"] as const;

/**
 * Whether this build may link to billing, and the links it may open. Until
 * the answer arrives, and when it fails, links count as not allowed.
 */
export function useUpgrade() {
	const { t } = useLingui();
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	const isOwner = session?.session?.role === "owner";

	const links = useQuery({
		queryKey: BILLING_LINKS_QUERY_KEY,
		queryFn: () => billingLinksAllowed(),
		networkMode: "always",
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
		retry: false,
	});
	const linksAllowed = links.data === true;

	const checkout = useMutation({
		mutationFn: () => proCheckoutUrl(organizationId as string),
		onSuccess: openUrl,
		onError: () =>
			Alert.alert(
				t({ message: "Could not start checkout. Please try again." }),
			),
	});

	return {
		/** False until the storefront is known, so a caller does not count a paywall that is about to show a link. */
		isResolved: !links.isPending,
		linksAllowed,
		/** Only an owner may buy a plan; the API refuses everyone else. */
		canUpgrade: linksAllowed && isOwner && organizationId !== null,
		upgrade: () => checkout.mutate(),
		isUpgrading: checkout.isPending,
		openBillingSettings: () => {
			if (linksAllowed) openUrl(billingSettingsUrl(organizationId));
		},
	};
}
