import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import {
	advertisedGbMinutesPerSeat,
	offersYearlyDiscount,
	PLAN_PRICE_CURRENCY,
	type PlanFamily,
	type PlanTier,
	planForInterval,
	seatPricePerMonth,
} from "@superset/shared/billing";
import { Button } from "@superset/ui/button";
import { Switch } from "@superset/ui/switch";
import { cn } from "@superset/ui/utils";
import { useState } from "react";

interface PlanListProps {
	catalog: PlanFamily[];
	plan: PlanTier;
	currentFamily: string | null;
	subscriptionInterval: "month" | "year" | null;
	highlightedFamilies: ReadonlySet<string>;
	canChangePlan: boolean;
	isUpgrading: boolean;
	onUpgrade: (family: PlanFamily, yearly: boolean) => void;
}

export function PlanList({
	catalog,
	plan,
	currentFamily,
	subscriptionInterval,
	highlightedFamilies,
	canChangePlan,
	isUpgrading,
	onUpgrade,
}: PlanListProps) {
	const { t } = useLingui();
	const { formatCurrency, formatNumber } = useFormat();
	const [manualYearly, setManualYearly] = useState<boolean>();
	const isYearly = manualYearly ?? subscriptionInterval !== "month";

	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-sm font-medium">
					{plan === "free" ? (
						<Trans>Upgrade your plan</Trans>
					) : (
						<Trans>Change plan</Trans>
					)}
				</h3>
				<p className="mt-1 text-sm text-muted-foreground">
					<Trans>
						Every paid plan includes Paradev Mobile, automations, and priority
						support. Plans with cloud workspaces give your team one shared pool
						of GB-hours.
					</Trans>
				</p>
			</div>
			{catalog.some(offersYearlyDiscount) && (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Switch
						checked={isYearly}
						onCheckedChange={setManualYearly}
						aria-label={t({ message: "Billed yearly" })}
					/>
					{isYearly ? (
						<Trans>Billed yearly</Trans>
					) : (
						<Trans>Billed monthly</Trans>
					)}
				</div>
			)}
			<div className="divide-y divide-border rounded-md border border-border">
				{catalog.map((family) => {
					const price = formatCurrency(
						seatPricePerMonth(family, isYearly),
						PLAN_PRICE_CURRENCY,
						{ minimumFractionDigits: 0 },
					);
					const gbMinutes = advertisedGbMinutesPerSeat(family);
					const gbHours = gbMinutes ? formatNumber(gbMinutes / 60) : null;
					const isCurrent =
						family.family === currentFamily &&
						(subscriptionInterval === null ||
							planForInterval(family, isYearly)?.interval ===
								subscriptionInterval);
					return (
						<div
							key={family.family}
							data-highlighted={highlightedFamilies.has(family.family)}
							className={cn(
								"flex items-center justify-between gap-4 p-4",
								highlightedFamilies.has(family.family) &&
									!isCurrent &&
									"bg-accent/60 ring-2 ring-inset ring-primary",
							)}
						>
							<div className="min-w-0">
								<div className="text-sm font-medium">{family.name}</div>
								<div className="mt-1 text-sm text-muted-foreground">
									{gbHours ? (
										<Trans>
											{price} per user/month, {gbHours} cloud GB-hours per seat
											each month
										</Trans>
									) : (
										<Trans>{price} per user/month</Trans>
									)}
								</div>
							</div>
							{canChangePlan && (
								<Button
									size="sm"
									className="shrink-0"
									variant={isCurrent ? "secondary" : "default"}
									disabled={isCurrent || isUpgrading}
									onClick={() => onUpgrade(family, isYearly)}
								>
									{isCurrent ? (
										<Trans>Current plan</Trans>
									) : plan === "free" ? (
										<Trans>Upgrade</Trans>
									) : (
										<Trans>Switch plan</Trans>
									)}
								</Button>
							)}
						</div>
					);
				})}
			</div>
			{!canChangePlan && (
				<p className="text-sm text-muted-foreground">
					<Trans>
						Only an organization owner can change the plan. Ask yours to
						upgrade.
					</Trans>
				</p>
			)}
		</div>
	);
}
