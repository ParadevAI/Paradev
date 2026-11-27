import { Trans } from "@lingui/react/macro";
import {
	BillingUsageCard,
	GbHourPurchase,
} from "@superset/ui/cloud-usage-page";
import { PageLink } from "@superset/ui/page-link";
import { Link } from "@tanstack/react-router";
import { useCloudUsageEnabled } from "renderer/hooks/useCloudUsageEnabled";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

interface CloudUsageCardProps {
	organizationId: string | null;
	canBuy: boolean;
}

export function CloudUsageCard({
	organizationId,
	canBuy,
}: CloudUsageCardProps) {
	const utils = cloudTrpc.useUtils();
	const { data: usage } = cloudTrpc.billing.cloudUsage.useQuery(undefined);
	const showUsageLink = useCloudUsageEnabled() === true;
	const { data: periods } = cloudTrpc.cloud.periods.list.useQuery({
		limit: 1,
	});
	if (!usage) return null;

	return (
		<div className="space-y-3">
			<BillingUsageCard
				period={periods?.items[0]}
				ratePerGbHour={periods?.ratePerGbHour ?? null}
				link={
					showUsageLink && (
						<PageLink>
							<Link to="/settings/cloud-usage">
								<Trans>Cloud usage</Trans>
							</Link>
						</PageLink>
					)
				}
			/>
			{canBuy && usage.pack && organizationId && (
				<GbHourPurchase
					organizationId={organizationId}
					pack={usage.pack}
					autoTopup={usage.autoTopup}
					post={(path, body) =>
						authClient.$fetch(path, { method: "POST", body, throw: true })
					}
					refresh={() =>
						Promise.all([
							utils.billing.cloudUsage.invalidate(),
							utils.billing.activePlan.invalidate(),
							utils.cloud.periods.list.invalidate(),
						])
					}
				/>
			)}
		</div>
	);
}
