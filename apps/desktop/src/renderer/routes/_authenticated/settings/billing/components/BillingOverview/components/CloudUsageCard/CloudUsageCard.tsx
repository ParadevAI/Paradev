import { Trans } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { Badge } from "@superset/ui/badge";
import { Progress } from "@superset/ui/progress";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { GbHourPurchase } from "./components/GbHourPurchase";

interface CloudUsageCardProps {
	organizationId: string | null;
	canBuy: boolean;
}

export function CloudUsageCard({
	organizationId,
	canBuy,
}: CloudUsageCardProps) {
	const { formatNumber, formatDate } = useFormat();
	const { data: usage } = cloudTrpc.billing.cloudUsage.useQuery(undefined);

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
		<div>
			<h3 className="text-sm font-medium mb-2 flex items-center gap-2">
				<Trans>Cloud usage</Trans>
				<Badge
					variant="secondary"
					className="px-1.5 py-0 text-[10px] font-medium"
				>
					<Trans>Beta</Trans>
				</Badge>
			</h3>
			<div className="space-y-2 py-3">
				<div className="flex items-baseline justify-between gap-4 text-sm">
					<span className="tabular-nums">
						{included === null ? (
							<Trans>GB-hours used: {used}</Trans>
						) : (
							<Trans>
								GB-hours used: {used} of {included}
							</Trans>
						)}
					</span>
					{resetDate && (
						<span className="text-xs text-muted-foreground">
							<Trans>Resets {resetDate}</Trans>
						</span>
					)}
				</div>
				{usage.includedGbMinutes !== null && usage.includedGbMinutes > 0 && (
					<Progress value={percentUsed} />
				)}
				{prepaid && (
					<div className="text-xs text-muted-foreground tabular-nums">
						<Trans>Bought GB-hours left: {prepaid}</Trans>
					</div>
				)}
				{overage && (
					<div className="text-xs text-warning tabular-nums">
						<Trans>GB-hours over the plan: {overage}</Trans>
					</div>
				)}
			</div>
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
