"use client";

import { Trans } from "@lingui/react/macro";
import { authClient } from "@superset/auth/client";
import {
	BillingUsageCard,
	GbHourPurchase,
} from "@superset/ui/cloud-usage-page";
import { PageLink } from "@superset/ui/page-link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTRPC } from "@/trpc/react";

interface CloudUsageCardProps {
	organizationId: string | null;
	canBuy: boolean;
	showUsageLink: boolean;
}

export function CloudUsageCard({
	organizationId,
	canBuy,
	showUsageLink,
}: CloudUsageCardProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { data: usage } = useQuery(trpc.billing.cloudUsage.queryOptions());
	const { data: periods } = useQuery({
		...trpc.cloud.periods.list.queryOptions({ limit: 1 }),
		enabled: showUsageLink,
	});
	if (!usage) return null;

	return (
		<div className="space-y-3 border-t pt-6">
			<BillingUsageCard
				period={periods?.items[0]}
				link={
					<PageLink>
						<Link href="/settings/cloud-usage">
							<Trans>Cloud usage</Trans>
						</Link>
					</PageLink>
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
							queryClient.invalidateQueries({
								queryKey: trpc.billing.cloudUsage.queryKey(),
							}),
							queryClient.invalidateQueries({
								queryKey: trpc.billing.activePlan.queryKey(),
							}),
							queryClient.invalidateQueries({
								queryKey: trpc.cloud.periods.list.queryKey(),
							}),
						])
					}
				/>
			)}
		</div>
	);
}
