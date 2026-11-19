import { useLingui } from "@lingui/react/macro";
import { offersGbHourPack } from "@superset/shared/billing";
import { PageLink } from "@superset/ui/page-link";
import { Link } from "@tanstack/react-router";
import { LuTriangleAlert } from "react-icons/lu";
import { useCurrentPlan } from "renderer/hooks/useCurrentPlan";
import { usePlanCatalog } from "renderer/hooks/usePlanCatalog";

export function CloudUsageStoppingBanner() {
	const { t } = useLingui();
	const { activePlan } = useCurrentPlan();
	const { data: catalog } = usePlanCatalog();
	const canBuy = offersGbHourPack(
		catalog?.find((family) => family.family === activePlan?.planTier),
	);

	return (
		<div
			role="alert"
			className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground/85"
		>
			<LuTriangleAlert
				className="size-4 shrink-0 text-foreground/85"
				aria-hidden="true"
			/>
			<span className="min-w-0 flex-1 select-text">
				{canBuy
					? t({
							message:
								"Your organization has used all its cloud usage for this period. This workspace stops in a few minutes. An owner can buy more in Settings, Billing.",
						})
					: t({
							message:
								"Your organization has used all its cloud usage for this period. This workspace stops in a few minutes. An owner can upgrade to Team or Ultra in Settings, Billing.",
						})}
			</span>
			<PageLink>
				<Link to="/settings/billing">{t({ message: "Billing" })}</Link>
			</PageLink>
		</div>
	);
}
