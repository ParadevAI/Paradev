"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { useFormat } from "@superset/i18n/react";
import {
	type GbHourPack,
	gbHourPurchase,
	PLAN_PRICE_CURRENCY,
} from "@superset/shared/billing";
import { useState } from "react";
import { Button } from "../../../ui/button";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from "../../../ui/item";
import { toast } from "../../../ui/sonner";
import { Switch } from "../../../ui/switch";
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
	/** The app's auth client call to a billing endpoint. */
	post: (path: string, body: Record<string, unknown>) => Promise<unknown>;
	/** Refetches the app's billing queries after a change. */
	refresh: () => Promise<unknown>;
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
	post,
	refresh,
}: GbHourPurchaseProps) {
	const { t } = useLingui();
	const { formatNumber, formatCurrency } = useFormat();
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
	const topupThreshold = formatNumber(topup.thresholdGbHours);
	const topupGbHours = formatNumber(topup.gbHours);
	const topupPrice = price(gbHourPurchase(pack, topup.gbHours).price);

	const buy = async (gbHours: number) => {
		const bought = formatNumber(gbHours);
		await post("/autumn/buyGbHours", { organizationId, gbHours });
		toast.success(t`Added ${bought} GB-hours.`);
		await refresh();
	};

	const saveTopup = async (next: TopupSettings) => {
		const previous = topup;
		setTopup(next);
		try {
			await post("/autumn/setAutoTopup", {
				organizationId,
				enabled: next.enabled,
				thresholdGbHours: next.thresholdGbHours,
				gbHours: next.gbHours,
			});
			await refresh();
		} catch (error) {
			setTopup(previous);
			toast.error(errorMessage(error));
			throw error;
		}
	};

	return (
		<ItemGroup className="border-t pt-2">
			<Item size="sm" className="px-0">
				<ItemContent>
					<ItemTitle className="font-normal">
						<Trans>Extra GB-hours</Trans>
					</ItemTitle>
				</ItemContent>
				<ItemActions>
					<Button size="sm" onClick={() => setIsBuyOpen(true)}>
						<Trans>Buy GB-hours</Trans>
					</Button>
				</ItemActions>
			</Item>
			<Item size="sm" className="px-0">
				<ItemContent>
					<ItemTitle className="font-normal">
						<Trans>Auto top-up</Trans>
					</ItemTitle>
					<ItemDescription>
						{topup.enabled ? (
							<Trans>
								When fewer than {topupThreshold} GB-hours remain, add{" "}
								{topupPrice} ({topupGbHours} GB-hours).
							</Trans>
						) : (
							<Trans context="auto top-up">Off</Trans>
						)}
					</ItemDescription>
				</ItemContent>
				<ItemActions>
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
				</ItemActions>
			</Item>
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
		</ItemGroup>
	);
}
