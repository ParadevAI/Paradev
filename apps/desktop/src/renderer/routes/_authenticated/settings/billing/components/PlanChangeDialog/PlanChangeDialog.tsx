import { Trans } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import type { PendingPlanChange } from "../../hooks/useBillingActions";

const PRICE_FORMAT = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

interface PlanChangeDialogProps {
	change: PendingPlanChange | null;
	isConfirming: boolean;
	onConfirm: () => void;
	onDismiss: () => void;
}

export function PlanChangeDialog({
	change,
	isConfirming,
	onConfirm,
	onDismiss,
}: PlanChangeDialogProps) {
	const { formatCurrency, formatDate } = useFormat();
	if (!change) return null;
	const { preview, options } = change;
	const planName = options.planName;
	const price = (value: number) =>
		formatCurrency(value, preview.currency, PRICE_FORMAT);
	const startsAt = preview.incoming.find(
		(item) => item.planId === options.planId,
	)?.effectiveAt;
	const isScheduled = Boolean(startsAt && startsAt > Date.now() + 60_000);
	const startDate = startsAt ? formatDate(new Date(startsAt)) : null;
	const total = price(Math.max(0, preview.total));
	const credit = preview.total < 0 ? price(-preview.total) : null;
	const charges = preview.lineItems.filter((item) => item.total !== 0);
	const nextTotal = preview.nextCycle?.total
		? price(preview.nextCycle.total)
		: null;
	const nextDate = preview.nextCycle
		? formatDate(new Date(preview.nextCycle.startsAt))
		: null;

	return (
		<Dialog open onOpenChange={(open) => !open && !isConfirming && onDismiss()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						<Trans>Switch to {planName}</Trans>
					</DialogTitle>
					<DialogDescription>
						{isScheduled ? (
							<Trans>
								Your plan switches to {planName} on {startDate}. Nothing is
								charged today.
							</Trans>
						) : (
							<Trans>
								The change starts now. You pay only the difference for the rest
								of this period.
							</Trans>
						)}
					</DialogDescription>
				</DialogHeader>
				{!isScheduled && (
					<div className="divide-y rounded-md border text-sm">
						{charges.map((item) => (
							<div
								key={`${item.displayName}-${item.description}`}
								className="flex items-start justify-between gap-4 px-3 py-2"
							>
								<div className="min-w-0">
									<div>{item.displayName}</div>
									<div className="text-xs text-muted-foreground">
										{item.description}
									</div>
								</div>
								<div className="shrink-0 tabular-nums">{price(item.total)}</div>
							</div>
						))}
						<div className="flex items-center justify-between px-3 py-2 font-medium">
							<Trans>Due today</Trans>
							<span className="tabular-nums">{total}</span>
						</div>
					</div>
				)}
				{credit && (
					<p className="text-xs text-muted-foreground">
						<Trans>{credit} of credit goes toward your next invoices.</Trans>
					</p>
				)}
				{nextTotal && nextDate && (
					<p className="text-xs text-muted-foreground">
						<Trans>
							Next charge: {nextTotal} on {nextDate}, plus any usage past the
							pool.
						</Trans>
					</p>
				)}
				<DialogFooter>
					<Button variant="outline" onClick={onDismiss} disabled={isConfirming}>
						<Trans>Cancel</Trans>
					</Button>
					<Button onClick={onConfirm} disabled={isConfirming}>
						{isScheduled || preview.total <= 0 ? (
							<Trans>Confirm switch</Trans>
						) : (
							<Trans>Pay {total}</Trans>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
