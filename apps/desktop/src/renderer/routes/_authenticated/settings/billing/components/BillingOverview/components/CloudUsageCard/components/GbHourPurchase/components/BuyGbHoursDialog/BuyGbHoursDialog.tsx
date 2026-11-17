import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { useFormat } from "@superset/i18n/react";
import {
	GB_HOUR_PURCHASE,
	type GbHourPack,
	gbHourPackPricePerGbHour,
	gbHourPurchase,
	PLAN_PRICE_CURRENCY,
} from "@superset/shared/billing";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupText,
} from "@superset/ui/input-group";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { PRESET_GB_HOURS, PRICE_FORMAT } from "../../constants";

interface BuyGbHoursDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	pack: GbHourPack;
	onBuy: (gbHours: number) => Promise<void>;
}

const NUMBER_INPUT_CLASS =
	"[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

export function BuyGbHoursDialog({
	open,
	onOpenChange,
	pack,
	onBuy,
}: BuyGbHoursDialogProps) {
	const { t } = useLingui();
	const { formatNumber, formatCurrency } = useFormat();
	const [selected, setSelected] = useState<number | "custom">(1000);
	const [custom, setCustom] = useState("");
	const [isBuying, setIsBuying] = useState(false);

	const price = (value: number) =>
		formatCurrency(value, PLAN_PRICE_CURRENCY, PRICE_FORMAT);
	const rate = formatCurrency(
		gbHourPackPricePerGbHour(pack),
		PLAN_PRICE_CURRENCY,
		PRICE_FORMAT,
	);
	const customHours = Number(custom);
	const gbHours =
		selected === "custom"
			? Number.isInteger(customHours) &&
				customHours >= GB_HOUR_PURCHASE.min &&
				customHours <= GB_HOUR_PURCHASE.max
				? customHours
				: null
			: selected;
	const total = gbHours ? price(gbHourPurchase(pack, gbHours).price) : null;
	const minHours = formatNumber(GB_HOUR_PURCHASE.min);
	const maxHours = formatNumber(GB_HOUR_PURCHASE.max);

	const buy = async () => {
		if (!gbHours) return;
		setIsBuying(true);
		try {
			await onBuy(gbHours);
			onOpenChange(false);
		} catch (error) {
			toast.error(errorMessage(error));
		} finally {
			setIsBuying(false);
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => !isBuying && onOpenChange(next)}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						<Trans>Buy extra GB-hours</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							{rate} per GB-hour. Used after the monthly pool, and never expire.
						</Trans>
					</DialogDescription>
				</DialogHeader>
				<div className="grid grid-cols-2 gap-2">
					{PRESET_GB_HOURS.map((hours) => (
						<button
							key={hours}
							type="button"
							onClick={() => setSelected(hours)}
							className={cn(
								"rounded-md border px-3 py-2.5 text-left transition-colors",
								selected === hours
									? "border-foreground bg-accent"
									: "hover:bg-accent/50",
							)}
						>
							<div className="text-sm font-medium tabular-nums">
								<Trans>{formatNumber(hours)} GB-hours</Trans>
							</div>
							<div className="text-xs text-muted-foreground tabular-nums">
								{price(gbHourPurchase(pack, hours).price)}
							</div>
						</button>
					))}
				</div>
				<div className="space-y-1.5">
					<InputGroup
						className={cn(selected === "custom" && "border-foreground")}
					>
						<InputGroupInput
							className={NUMBER_INPUT_CLASS}
							type="number"
							inputMode="numeric"
							min={GB_HOUR_PURCHASE.min}
							max={GB_HOUR_PURCHASE.max}
							step={1}
							placeholder={t`Custom amount`}
							value={custom}
							onFocus={() => setSelected("custom")}
							onChange={(event) => {
								setSelected("custom");
								setCustom(event.target.value);
							}}
							aria-label={t`Custom amount of GB-hours`}
						/>
						<InputGroupAddon align="inline-end">
							<InputGroupText>
								<Trans>GB-hours</Trans>
							</InputGroupText>
						</InputGroupAddon>
					</InputGroup>
					{selected === "custom" && !gbHours && (
						<p className="text-xs text-muted-foreground">
							<Trans>
								Enter a whole number from {minHours} to {maxHours} GB-hours.
							</Trans>
						</p>
					)}
				</div>
				<div className="flex items-center justify-between border-t pt-3 text-sm">
					<Trans>Total</Trans>
					<span className="font-medium tabular-nums">{total ?? "–"}</span>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isBuying}
					>
						<Trans>Cancel</Trans>
					</Button>
					<Button onClick={buy} disabled={!gbHours || isBuying}>
						{total ? <Trans>Buy for {total}</Trans> : <Trans>Buy</Trans>}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
