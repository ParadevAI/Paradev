import { Trans } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import {
	offersYearlyDiscount,
	PLAN_PRICE_CURRENCY,
	type PlanFamily,
	seatPricePerMonth,
} from "@superset/shared/billing";
import { Button } from "@superset/ui/button";

interface UpgradeCardProps {
	family: PlanFamily;
	onUpgrade: () => void;
	isUpgrading: boolean;
}

export function UpgradeCard({
	family,
	onUpgrade,
	isUpgrading,
}: UpgradeCardProps) {
	const { formatCurrency } = useFormat();
	const formatSeatPrice = (yearly: boolean) =>
		formatCurrency(seatPricePerMonth(family, yearly), PLAN_PRICE_CURRENCY, {
			minimumFractionDigits: 0,
		});
	const planName = family.name;
	const monthlyPrice = formatSeatPrice(false);
	const yearlyPrice = formatSeatPrice(true);

	return (
		<div className="flex items-center justify-between gap-8 py-3">
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium">
						<Trans>Upgrade to {planName}</Trans>
					</span>
					<span className="inline-flex items-center rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-background">
						{planName}
					</span>
				</div>
				<div className="text-xs text-muted-foreground mt-0.5">
					{offersYearlyDiscount(family) ? (
						<Trans>
							{monthlyPrice} per user/mo billed monthly, or {yearlyPrice} billed
							yearly. Mobile, automations, priority support.
						</Trans>
					) : (
						<Trans>
							{monthlyPrice} per user/mo. Mobile, automations, priority support.
						</Trans>
					)}
				</div>
			</div>
			<Button
				onClick={onUpgrade}
				size="sm"
				disabled={isUpgrading}
				className="shrink-0"
			>
				{isUpgrading ? <Trans>Redirecting...</Trans> : <Trans>Upgrade</Trans>}
			</Button>
		</div>
	);
}
