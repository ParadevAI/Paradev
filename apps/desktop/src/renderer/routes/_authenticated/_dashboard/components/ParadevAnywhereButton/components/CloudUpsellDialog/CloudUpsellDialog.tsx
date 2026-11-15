import { Trans } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import {
	advertisedGbMinutesPerSeat,
	PLAN_PRICE_CURRENCY,
	planForInterval,
	seatPricePerMonth,
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
import { useNavigate } from "@tanstack/react-router";
import { LuCloud } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { PlanChangeDialog } from "renderer/routes/_authenticated/components/PlanChangeDialog";
import { useBillingActions } from "renderer/routes/_authenticated/hooks/useBillingActions";
import { useIsOrganizationOwner } from "renderer/routes/_authenticated/hooks/useIsOrganizationOwner";
import { usePlanCatalog } from "renderer/routes/_authenticated/hooks/usePlanCatalog";

interface CloudUpsellDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function CloudUpsellDialog({
	open,
	onOpenChange,
}: CloudUpsellDialogProps) {
	const { formatCurrency, formatNumber } = useFormat();
	const navigate = useNavigate();
	const isOwner = useIsOrganizationOwner();
	const catalogQuery = usePlanCatalog();
	const { data: members } = cloudTrpc.organization.listMembers.useQuery({
		includeDeactivated: false,
	});
	const memberCount =
		members && members.length > 0 ? members.length : undefined;
	const {
		upgrade,
		isUpgrading,
		pendingChange,
		confirmChange,
		dismissChange,
		isConfirming,
	} = useBillingActions();

	const teamFamily = catalogQuery.data?.find(
		(family) => advertisedGbMinutesPerSeat(family) !== null,
	);
	const monthly = teamFamily ? planForInterval(teamFamily, false) : null;
	const gbMinutes = teamFamily ? advertisedGbMinutesPerSeat(teamFamily) : null;
	const gbHours = gbMinutes ? formatNumber(gbMinutes / 60) : null;
	const price = teamFamily
		? formatCurrency(
				seatPricePerMonth(teamFamily, false),
				PLAN_PRICE_CURRENCY,
				{
					minimumFractionDigits: 0,
				},
			)
		: null;
	const planName = teamFamily?.name ?? "";

	const comparePlans = () => {
		onOpenChange(false);
		void navigate({ to: "/settings/billing", search: { source: "cloud" } });
	};

	const handleUpgrade = async () => {
		if (!teamFamily || !monthly || memberCount === undefined) return;
		await upgrade({
			planId: monthly.id,
			planName: teamFamily.name,
			annual: false,
			seats: memberCount,
			source: "cloud_upsell",
		});
		onOpenChange(false);
	};

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<div className="mb-2 flex size-9 items-center justify-center rounded-lg border border-border bg-muted">
							<LuCloud className="size-4" aria-hidden="true" />
						</div>
						<DialogTitle>
							{teamFamily ? (
								<Trans>Run agents in the cloud with {planName}</Trans>
							) : (
								<Trans>Run agents in the cloud</Trans>
							)}
						</DialogTitle>
						<DialogDescription>
							<Trans>
								Cloud workspaces keep agents working while your computer is off,
								and your whole team shares them.
							</Trans>
						</DialogDescription>
					</DialogHeader>
					{teamFamily && price && (
						<div className="rounded-md border border-border p-4">
							<div className="flex items-baseline gap-1.5">
								<span className="text-2xl font-semibold">{price}</span>
								<span className="text-sm text-muted-foreground">
									<Trans>per user/month</Trans>
								</span>
							</div>
							{gbHours && (
								<p className="mt-1 text-sm text-muted-foreground">
									<Trans>
										{gbHours} cloud GB-hours per seat each month, in one pool
										for your organization.
									</Trans>
								</p>
							)}
						</div>
					)}
					{catalogQuery.isLoading && (
						<p className="text-sm text-muted-foreground">
							<Trans>Loading plans...</Trans>
						</p>
					)}
					{teamFamily && !isOwner && (
						<p className="text-sm text-muted-foreground">
							<Trans>
								Only an organization owner can change the plan. Ask yours to
								upgrade.
							</Trans>
						</p>
					)}
					<DialogFooter>
						<Button variant="outline" onClick={comparePlans}>
							<Trans>Compare plans</Trans>
						</Button>
						{teamFamily && isOwner && (
							<Button
								onClick={handleUpgrade}
								disabled={isUpgrading || memberCount === undefined}
							>
								{isUpgrading ? (
									<Trans>Opening checkout...</Trans>
								) : (
									<Trans>Upgrade to {planName}</Trans>
								)}
							</Button>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<PlanChangeDialog
				change={pendingChange}
				isConfirming={isConfirming}
				onConfirm={confirmChange}
				onDismiss={dismissChange}
			/>
		</>
	);
}
