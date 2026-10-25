import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { useFormat } from "@superset/i18n/react";
import {
	type GbHourPack,
	gbHourPackPricePerGbHour,
	gbHourPurchase,
	PLAN_PRICE_CURRENCY,
} from "@superset/shared/billing";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useState } from "react";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { AutoTopupDialog } from "./components/AutoTopupDialog";
import { BuyGbHoursDialog } from "./components/BuyGbHoursDialog";
import { DEFAULT_TOPUP, PRICE_FORMAT } from "./constants";

interface GbHourPurchaseProps {
	organizationId: string;
	pack: GbHourPack;
	autoTopup: {
		enabled: boolean;
		thresholdGbMinutes: number;
		quantityGbMinutes: number;
	} | null;
}

interface TopupSettings {
	enabled: boolean;
	thresholdGbHours: number;
	gbHours: number;
}

export function GbHourPurchase({
	organizationId,
	pack,
	autoTopup,
}: GbHourPurchaseProps) {
	const { t } = useLingui();
	const { formatNumber, formatCurrency } = useFormat();
	const utils = cloudTrpc.useUtils();
	const refresh = () =>
		Promise.all([
			utils.billing.cloudUsage.invalidate(),
			utils.billing.activePlan.invalidate(),
		]);
	const [isBuyOpen, setIsBuyOpen] = useState(false);
	const [isTopupOpen, setIsTopupOpen] = useState(false);
	const [topup, setTopup] = useState<TopupSettings>(
		autoTopup
			? {
					enabled: autoTopup.enabled,
					thresholdGbHours: Math.round(autoTopup.thresholdGbMinutes / 60),
					gbHours: Math.round(autoTopup.quantityGbMinutes / 60),
				}
			: { enabled: false, ...DEFAULT_TOPUP },
	);

	const price = (value: number) =>
		formatCurrency(value, PLAN_PRICE_CURRENCY, PRICE_FORMAT);
	const rate = formatCurrency(
		gbHourPackPricePerGbHour(pack),
		PLAN_PRICE_CURRENCY,
		PRICE_FORMAT,
	);
	const topupThreshold = formatNumber(topup.thresholdGbHours);
	const topupGbHours = formatNumber(topup.gbHours);
	const topupPrice = price(gbHourPurchase(pack, topup.gbHours).price);

	const buy = async (gbHours: number) => {
		const bought = formatNumber(gbHours);
		await authClient.$fetch("/autumn/buyGbHours", {
			method: "POST",
			body: { organizationId, gbHours },
			throw: true,
		});
		toast.success(t`Added ${bought} GB-hours.`);
		await refresh();
	};

	const saveTopup = async (next: TopupSettings) => {
		const previous = topup;
		setTopup(next);
		try {
			await authClient.$fetch("/autumn/setAutoTopup", {
				method: "POST",
				body: {
					organizationId,
					enabled: next.enabled,
					thresholdGbHours: next.thresholdGbHours,
					gbHours: next.gbHours,
				},
				throw: true,
			});
			await refresh();
		} catch (error) {
			setTopup(previous);
			toast.error(errorMessage(error));
			throw error;
		}
	};

	return (
		<div className="space-y-4 border-t pt-4">
			<div className="flex items-center justify-between gap-4">
				<div className="min-w-0">
					<div className="text-sm">
						<Trans>Extra GB-hours</Trans>
					</div>
					<div className="text-xs text-muted-foreground">
						<Trans>
							{rate} per GB-hour. Used after the monthly pool, and never expire.
						</Trans>
					</div>
				</div>
				<Button size="sm" onClick={() => setIsBuyOpen(true)}>
					<Trans>Buy GB-hours</Trans>
				</Button>
			</div>
			<div className="flex items-center justify-between gap-4">
				<div className="min-w-0">
					<div className="text-sm">
						<Trans>Auto top-up</Trans>
					</div>
					<div className="text-xs text-muted-foreground">
						{topup.enabled ? (
							<Trans>
								When fewer than {topupThreshold} GB-hours remain, add{" "}
								{topupPrice} ({topupGbHours} GB-hours).
							</Trans>
						) : (
							<Trans>Off. Buys more GB-hours when they run low.</Trans>
						)}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{topup.enabled && (
						<Button
							size="sm"
							variant="ghost"
							onClick={() => setIsTopupOpen(true)}
						>
							<Trans>Edit</Trans>
						</Button>
					)}
					<Switch
						checked={topup.enabled}
						onCheckedChange={(enabled) =>
							enabled
								? setIsTopupOpen(true)
								: void saveTopup({ ...topup, enabled: false }).catch(() => {})
						}
						aria-label={t`Auto top-up`}
					/>
				</div>
			</div>
			<BuyGbHoursDialog
				open={isBuyOpen}
				onOpenChange={setIsBuyOpen}
				pack={pack}
				onBuy={buy}
			/>
			<AutoTopupDialog
				open={isTopupOpen}
				onOpenChange={setIsTopupOpen}
				pack={pack}
				initial={topup}
				onSave={(settings) => saveTopup({ ...settings, enabled: true })}
			/>
		</div>
	);
}
