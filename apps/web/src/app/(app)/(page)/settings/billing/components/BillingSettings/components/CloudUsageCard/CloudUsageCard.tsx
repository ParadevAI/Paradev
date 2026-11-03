"use client";

import { Trans } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { Badge } from "@superset/ui/badge";
import { Progress } from "@superset/ui/progress";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { GbHourPurchase } from "./components/GbHourPurchase";

interface CloudUsageCardProps {
	organizationId: string | null;
	canBuy: boolean;
}

export function CloudUsageCard({
	organizationId,
	canBuy,
}: CloudUsageCardProps) {
	const trpc = useTRPC();
	const { formatNumber, formatDate } = useFormat();
	const { data: usage } = useQuery(trpc.billing.cloudUsage.queryOptions());

	if (
		!usage ||
		(usage.includedGbMinutes === 0 &&
			usage.usedGbMinutes === 0 &&
			usage.overageGbMinutes === 0 &&
			usage.prepaidGbMinutes === 0 &&
			!usage.pack)
	) {
		return null;
	}

	const gbHours = (gbMinutes: number) => {
		const hours = gbMinutes / 60;
		if (hours > 0 && hours < 0.1) return `<${formatNumber(0.1)}`;
		return formatNumber(hours, { maximumFractionDigits: 1 });
	};
	const used = gbHours(usage.usedGbMinutes);
	const included =
		usage.includedGbMinutes === null ? null : gbHours(usage.includedGbMinutes);
	const overage =
		usage.overageGbMinutes > 0 ? gbHours(usage.overageGbMinutes) : null;
	const prepaid =
		usage.prepaidGbMinutes > 0 ? gbHours(usage.prepaidGbMinutes) : null;
	const resetDate = usage.resetsAt
		? formatDate(new Date(usage.resetsAt))
		: null;
	const percentUsed =
		usage.includedGbMinutes && usage.includedGbMinutes > 0
			? Math.min(100, (usage.usedGbMinutes / usage.includedGbMinutes) * 100)
			: 100;

	return (
		<div className="space-y-3 border-t pt-6">
			<div className="flex items-baseline justify-between gap-4">
				<div className="flex items-center gap-2 text-sm font-medium">
					<Trans>Cloud usage</Trans>
					<Badge
						variant="secondary"
						className="px-1.5 py-0 text-[10px] font-medium"
					>
						<Trans>Beta</Trans>
					</Badge>
				</div>
				{resetDate && (
					<div className="text-sm text-muted-foreground">
						<Trans>Resets {resetDate}</Trans>
					</div>
				)}
			</div>
			<div className="text-sm tabular-nums">
				{included === null ? (
					<Trans>GB-hours used: {used}</Trans>
				) : (
					<Trans>
						GB-hours used: {used} of {included}
					</Trans>
				)}
			</div>
			{usage.includedGbMinutes !== null && usage.includedGbMinutes > 0 && (
				<Progress value={percentUsed} />
			)}
			{prepaid && (
				<div className="text-sm text-muted-foreground tabular-nums">
					<Trans>Bought GB-hours left: {prepaid}</Trans>
				</div>
			)}
			{overage && (
				<div className="text-sm text-warning tabular-nums">
					<Trans>GB-hours over the plan: {overage}</Trans>
				</div>
			)}
			{canBuy && usage.pack && organizationId && (
				<GbHourPurchase
					organizationId={organizationId}
					pack={usage.pack}
					autoTopup={usage.autoTopup}
				/>
			)}
		</div>
	);
}
