import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { z } from "zod";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { BillingOverview } from "./components/BillingOverview";

export const Route = createFileRoute("/_authenticated/settings/billing/")({
	validateSearch: z.object({
		source: z.enum(["cloud"]).optional().catch(undefined),
		checkout: z.enum(["success"]).optional().catch(undefined),
	}),
	component: BillingPage,
});

function BillingPage() {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const { source, checkout } = Route.useSearch();
	const navigate = useNavigate();
	const utils = cloudTrpc.useUtils();

	useEffect(() => {
		if (checkout !== "success") return;
		toast.success(t({ message: "Payment successful. Your plan is updated." }), {
			id: "checkout-success",
		});
		void utils.billing.invalidate();
		void navigate({
			to: "/settings/billing",
			search: { source },
			replace: true,
		});
	}, [checkout, source, navigate, utils, t]);

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "billing").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return (
		<BillingOverview
			visibleItems={visibleItems}
			highlightCloud={source === "cloud"}
		/>
	);
}
