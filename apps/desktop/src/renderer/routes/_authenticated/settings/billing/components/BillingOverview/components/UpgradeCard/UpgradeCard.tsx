import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { useFormat } from "@superset/i18n/react";
import { PRO_SEAT_PRICE, proSeatPricePerMonth } from "@superset/shared/billing";
import { Button } from "@superset/ui/button";
import { PLANS } from "../../../../constants";

interface UpgradeCardProps {
	onUpgrade: () => void;
	isUpgrading: boolean;
}

export function UpgradeCard({ onUpgrade, isUpgrading }: UpgradeCardProps) {
	const plan = PLANS.pro;
	const { formatCurrency } = useFormat();
	const formatSeatPrice = (annual: boolean) =>
		formatCurrency(proSeatPricePerMonth({ annual }), PRO_SEAT_PRICE.currency, {
			minimumFractionDigits: 0,
		});
	const monthlyPrice = formatSeatPrice(false);
	const yearlyPrice = formatSeatPrice(true);

	return (
		<div className="flex items-center justify-between gap-8 py-3">
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium">
						<Trans>Upgrade to {i18n._(plan.name)}</Trans>
					</span>
					<span className="inline-flex items-center rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-background">
						{i18n._(plan.name)}
					</span>
				</div>
				<div className="text-xs text-muted-foreground mt-0.5">
					<Trans>
						{monthlyPrice} per user/mo billed monthly, or {yearlyPrice} billed
						yearly. Cloud workspaces, mobile, priority support.
					</Trans>
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
