"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import {
	AUTO_TOPUP_MONTHLY_LIMIT,
	type GbHourPack,
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
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useEffect, useState } from "react";
import {
	PRESET_GB_HOURS,
	PRICE_FORMAT,
	THRESHOLDS_GB_HOURS,
} from "../../constants";

interface TopupFields {
	thresholdGbHours: number;
	gbHours: number;
}

interface AutoTopupDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	pack: GbHourPack;
	initial: TopupFields;
	onSave: (settings: TopupFields) => Promise<void>;
}

export function AutoTopupDialog({
	open,
	onOpenChange,
	pack,
	initial,
	onSave,
}: AutoTopupDialogProps) {
	const { t } = useLingui();
	const { formatNumber, formatCurrency } = useFormat();
	const [threshold, setThreshold] = useState(initial.thresholdGbHours);
	const [gbHours, setGbHours] = useState(initial.gbHours);
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (!open) return;
		setThreshold(initial.thresholdGbHours);
		setGbHours(initial.gbHours);
	}, [open, initial.thresholdGbHours, initial.gbHours]);

	const price = (value: number) =>
		formatCurrency(value, PLAN_PRICE_CURRENCY, PRICE_FORMAT);
	const monthlyMax = price(
		gbHourPurchase(pack, gbHours).price * AUTO_TOPUP_MONTHLY_LIMIT,
	);
	const amounts = PRESET_GB_HOURS.includes(gbHours)
		? PRESET_GB_HOURS
		: [...PRESET_GB_HOURS, gbHours].sort((a, b) => a - b);
	const thresholds = THRESHOLDS_GB_HOURS.includes(threshold)
		? THRESHOLDS_GB_HOURS
		: [...THRESHOLDS_GB_HOURS, threshold].sort((a, b) => a - b);

	const save = async () => {
		setIsSaving(true);
		const saved = await onSave({ thresholdGbHours: threshold, gbHours }).then(
			() => true,
			() => false,
		);
		setIsSaving(false);
		if (saved) onOpenChange(false);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => !isSaving && onOpenChange(next)}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						<Trans>Auto top-up</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							Charge your saved card for more GB-hours when bought GB-hours run
							low.
						</Trans>
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-1.5">
						<Label>
							<Trans>When bought GB-hours fall below</Trans>
						</Label>
						<Select
							value={String(threshold)}
							onValueChange={(value) => setThreshold(Number(value))}
						>
							<SelectTrigger aria-label={t`Threshold`}>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{thresholds.map((hours) => (
									<SelectItem key={hours} value={String(hours)}>
										<Trans>{formatNumber(hours)} GB-hours</Trans>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1.5">
						<Label>
							<Trans>Top-up amount</Trans>
						</Label>
						<Select
							value={String(gbHours)}
							onValueChange={(value) => setGbHours(Number(value))}
						>
							<SelectTrigger aria-label={t`Top-up amount`}>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{amounts.map((hours) => {
									const hoursLabel = formatNumber(hours);
									const amount = price(gbHourPurchase(pack, hours).price);
									return (
										<SelectItem key={hours} value={String(hours)}>
											<Trans>
												{amount} ({hoursLabel} GB-hours)
											</Trans>
										</SelectItem>
									);
								})}
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">
							<Trans>
								At most {AUTO_TOPUP_MONTHLY_LIMIT} top-ups a month, so up to{" "}
								{monthlyMax} a month.
							</Trans>
						</p>
					</div>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isSaving}
					>
						<Trans>Cancel</Trans>
					</Button>
					<Button onClick={save} disabled={isSaving}>
						<Trans>Save</Trans>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
