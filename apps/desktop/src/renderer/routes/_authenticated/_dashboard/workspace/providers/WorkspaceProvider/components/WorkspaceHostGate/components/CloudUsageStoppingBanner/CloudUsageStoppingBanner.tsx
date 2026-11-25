import { useLingui } from "@lingui/react/macro";
import { offersGbHourPack } from "@superset/shared/billing";
import { PageLink } from "@superset/ui/page-link";
import { Link } from "@tanstack/react-router";
import { useCurrentPlan } from "renderer/hooks/useCurrentPlan";
import { usePlanCatalog } from "renderer/hooks/usePlanCatalog";
import { CloudUsageBanner } from "../CloudUsageBanner";

export function CloudUsageStoppingBanner() {
	const { t } = useLingui();
	const { activePlan } = useCurrentPlan();
	const { data: catalog } = usePlanCatalog();
	if (!catalog || !activePlan) return null;
	const canBuy = offersGbHourPack(
		catalog.find((family) => family.family === activePlan.planTier),
	);

	return (
		<CloudUsageBanner
			tone="warning"
			message={
				canBuy
					? t({
							message:
								"Cloud usage is used up for this period. This workspace stops in 10 minutes. An owner can buy more to keep it running.",
						})
					: t({
							message:
								"Cloud usage is used up for this period. This workspace stops in 10 minutes. An owner can upgrade to Team or Ultra to keep it running.",
						})
			}
			actions={
				<PageLink>
					<Link to="/settings/billing">{t({ message: "Billing" })}</Link>
				</PageLink>
			}
		/>
	);
}
