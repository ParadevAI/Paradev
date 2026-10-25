"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { authClient } from "@superset/auth/client";
import {
	formatCurrency,
	formatDate,
	formatNumber,
} from "@superset/i18n/format";
import {
	familyForPlan,
	isPaymentFailingStatus,
	offersYearlyDiscount,
	PLAN_PRICE_CURRENCY,
	type PlanFamily,
	planForInterval,
	resolveCurrentPlan,
	seatPricePerMonth,
} from "@superset/shared/billing";
import { COMPANY } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { cn } from "@superset/ui/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTRPC } from "@/trpc/react";
import { CloudUsageCard } from "./components/CloudUsageCard";
import { PlanChangeDialog } from "./components/PlanChangeDialog";
import { useBillingActions } from "./hooks/useBillingActions";
import { usePlanCatalog } from "./hooks/usePlanCatalog";

interface BillingSettingsProps {
	/**
	 * The organization the caller wants billed, when it may differ from this
	 * session's active one: the mobile app links here with its own active
	 * organization, and the two sessions do not share that choice.
	 */
	organizationId?: string;
	selectedPlan?: string;
	yearly?: boolean;
}

export function BillingSettings({
	organizationId,
	selectedPlan,
	yearly,
}: BillingSettingsProps) {
	const { t } = useLingui();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { data: session, isPending: sessionPending } = authClient.useSession();
	const [manualYearly, setIsYearly] = useState(yearly);

	const activeOrganizationId = session?.session?.activeOrganizationId;
	const switchingOrganization =
		!!session && !!organizationId && organizationId !== activeOrganizationId;
	const notMemberMessage = t({
		message: "You are not a member of that organization.",
	});

	useEffect(() => {
		if (!switchingOrganization) return;
		let cancelled = false;
		authClient.organization
			.setActive({ organizationId })
			.then(() => queryClient.invalidateQueries())
			.catch(() => {
				if (!cancelled) toast.error(notMemberMessage);
			});
		return () => {
			cancelled = true;
		};
	}, [switchingOrganization, organizationId, queryClient, notMemberMessage]);

	const { data: organizations } = useQuery(
		trpc.user.myOrganizations.queryOptions(),
	);
	const { data: members } = useQuery(
		trpc.organization.listMembers.queryOptions({ includeDeactivated: false }),
	);
	const { data: activePlan } = useQuery(trpc.billing.activePlan.queryOptions());
	const isYearly = manualYearly ?? activePlan?.billingInterval !== "month";

	const organization = organizations?.find(
		(candidate) => candidate.id === activeOrganizationId,
	);
	const currentMember = members?.find(
		(member) => member.userId === session?.user?.id,
	);
	const isOwner = currentMember?.role === "owner";
	// Seats are billed from this, so an unresolved list keeps checkout off.
	const memberCount =
		members && members.length > 0 ? members.length : undefined;

	const plan = resolveCurrentPlan({
		subscriptionPlan: activePlan?.plan,
		sessionPlan: session?.session?.plan,
		subscriptionsLoaded: activePlan !== undefined,
	});
	const cancelAt = activePlan?.cancelAt;
	const usesAutumn = activePlan?.billingProvider === "autumn";
	const catalogQuery = usePlanCatalog({
		organizationId: activeOrganizationId,
		enabled: usesAutumn,
	});
	const catalog = catalogQuery.data ?? [];
	const scheduledAt = activePlan?.scheduledAt;
	const nextPlanName = activePlan?.scheduledPlanId
		? (familyForPlan(catalog, activePlan.scheduledPlanId)?.family.name ?? null)
		: null;
	const isSwitching = Boolean(nextPlanName && scheduledAt);
	const currentFamily =
		plan === "pro"
			? (familyForPlan(catalog, activePlan?.autumnPlanId)?.family ?? null)
			: null;
	const subscriptionInterval =
		activePlan?.billingInterval === "year" ||
		activePlan?.billingInterval === "month"
			? activePlan.billingInterval
			: null;
	const periodEnd = activePlan?.periodEnd;
	const isPaymentFailing = isPaymentFailingStatus(activePlan?.status);

	const invalidatePlan = () =>
		queryClient.invalidateQueries({
			queryKey: trpc.billing.activePlan.queryKey(),
		});

	const {
		upgrade,
		cancel: handleCancel,
		restore: handleRestore,
		openPortal,
		isUpgrading,
		isCanceling,
		isRestoring,
		isOpeningPortal,
		pendingChange,
		confirmChange,
		dismissChange,
		isConfirming,
	} = useBillingActions({
		activeOrganizationId,
		activePlan,
		plan,
		invalidatePlan,
	});

	const handleUpgrade = async (family: PlanFamily) => {
		const target = planForInterval(family, isYearly);
		if (memberCount === undefined || !target) return;
		await upgrade({
			planId: target.id,
			planName: family.name,
			annual: target.interval === "year",
			seats: memberCount,
		});
	};

	if (sessionPending || switchingOrganization || activePlan === undefined) {
		return (
			<p className="py-16 text-center text-sm text-muted-foreground">
				<Trans>Loading...</Trans>
			</p>
		);
	}

	const planLabel = currentFamily
		? currentFamily.name
		: {
				free: t({ message: "Free" }),
				pro: t({ message: "Pro" }),
				enterprise: t({ message: "Enterprise" }),
			}[plan];

	const planHint =
		plan === "enterprise"
			? t({ message: "Managed by your organization admin." })
			: isSwitching && scheduledAt
				? t({
						message: `Switches to ${nextPlanName} on ${formatDate(scheduledAt)}.`,
					})
				: cancelAt
					? t({
							message: `Cancels ${formatDate(cancelAt)} — downgrades to Free at the end of the billing period.`,
						})
					: plan === "pro" && periodEnd
						? t({ message: `Renews ${formatDate(periodEnd)}.` })
						: null;
	const seatHint =
		plan === "pro" && !cancelAt && !isPaymentFailing && periodEnd
			? t({
					message: `Seats removed mid-cycle stay active until ${formatDate(periodEnd)}.`,
				})
			: null;

	return (
		<div className="mx-auto max-w-2xl space-y-8">
			<div>
				<h2 className="text-xl font-medium">
					<Trans>Billing</Trans>
				</h2>
				{organization && (
					<p className="mt-1 text-sm text-muted-foreground">
						{organization.name}
					</p>
				)}
			</div>

			{isPaymentFailing && (
				<div className="flex flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-sm">
						<Trans>
							Your last payment failed. Update your payment method to keep Pro.
						</Trans>
					</p>
					{isOwner && (
						<Button
							size="sm"
							variant="outline"
							className="shrink-0"
							disabled={isOpeningPortal}
							onClick={() => openPortal("payment_method_update")}
						>
							<Trans>Update payment method</Trans>
						</Button>
					)}
				</div>
			)}

			<div className="flex items-center justify-between gap-8 border-t pt-6">
				<div className="min-w-0">
					<div className="text-sm font-medium">
						<Trans>{planLabel} plan</Trans>
					</div>
					{planHint && (
						<div className="mt-1 text-sm text-muted-foreground">{planHint}</div>
					)}
					{seatHint && (
						<div className="mt-1 text-sm text-muted-foreground">{seatHint}</div>
					)}
				</div>
				{plan === "pro" && isOwner && (
					<div className="shrink-0">
						{cancelAt || isSwitching ? (
							<Button
								variant="outline"
								size="sm"
								onClick={handleRestore}
								disabled={isRestoring}
							>
								{isRestoring ? (
									<Trans>Restoring...</Trans>
								) : isSwitching ? (
									<Trans>Keep {planLabel}</Trans>
								) : (
									<Trans>Restore plan</Trans>
								)}
							</Button>
						) : (
							<Button
								variant="ghost"
								size="sm"
								onClick={handleCancel}
								disabled={isCanceling}
								className="text-muted-foreground hover:text-destructive"
							>
								{isCanceling ? (
									<Trans>Canceling...</Trans>
								) : (
									<Trans>Cancel plan</Trans>
								)}
							</Button>
						)}
					</div>
				)}
			</div>

			<CloudUsageCard
				organizationId={activeOrganizationId ?? null}
				canBuy={isOwner}
			/>

			{(plan === "free" || (plan === "pro" && usesAutumn && !cancelAt)) &&
				(catalog.length > 0 || catalogQuery.isError) && (
					<div className="space-y-4 border-t pt-6">
						<div>
							<div className="text-sm font-medium">
								{plan === "free" ? (
									<Trans>Upgrade your plan</Trans>
								) : (
									<Trans>Change plan</Trans>
								)}
							</div>
							<div className="mt-1 text-sm text-muted-foreground">
								<Trans>
									Every paid plan includes Superset Mobile, automations, and
									priority support. Plans with cloud workspaces give your team
									one shared pool of GB-hours.
								</Trans>
							</div>
						</div>
						{catalogQuery.isError && (
							<div className="flex items-center gap-3 text-sm text-muted-foreground">
								<Trans>Could not load plans.</Trans>
								<Button
									size="sm"
									variant="outline"
									onClick={() => catalogQuery.refetch()}
								>
									<Trans>Retry</Trans>
								</Button>
							</div>
						)}
						{catalog.some(offersYearlyDiscount) && (
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<Switch
									checked={isYearly}
									onCheckedChange={setIsYearly}
									aria-label={t({ message: "Billed yearly" })}
								/>
								{isYearly ? (
									<Trans>Billed yearly</Trans>
								) : (
									<Trans>Billed monthly</Trans>
								)}
							</div>
						)}
						<div className="divide-y rounded-md border">
							{catalog.map((family) => {
								const price = formatCurrency(
									seatPricePerMonth(family, isYearly),
									PLAN_PRICE_CURRENCY,
									{ minimumFractionDigits: 0 },
								);
								const gbHours = family.gbMinutesPerSeat
									? formatNumber(family.gbMinutesPerSeat / 60)
									: null;
								const isCurrent =
									family.family === currentFamily?.family &&
									(subscriptionInterval === null ||
										planForInterval(family, isYearly)?.interval ===
											subscriptionInterval);
								return (
									<div
										key={family.family}
										className={cn(
											"flex items-center justify-between gap-4 p-4",
											family.family === selectedPlan &&
												!isCurrent &&
												"bg-accent/60 ring-2 ring-inset ring-primary",
										)}
									>
										<div className="min-w-0">
											<div className="text-sm font-medium">{family.name}</div>
											<div className="mt-1 text-sm text-muted-foreground">
												{gbHours ? (
													<Trans>
														{price} per user/month, {gbHours} cloud GB-hours per
														seat each month
													</Trans>
												) : (
													<Trans>{price} per user/month</Trans>
												)}
											</div>
										</div>
										{isOwner && (
											<Button
												size="sm"
												className="shrink-0"
												variant={isCurrent ? "secondary" : "default"}
												disabled={
													isCurrent || isUpgrading || memberCount === undefined
												}
												onClick={() => handleUpgrade(family)}
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
						{!isOwner && (
							<p className="text-sm text-muted-foreground">
								<Trans>
									Only an organization owner can change the plan. Ask yours to
									upgrade.
								</Trans>
							</p>
						)}
					</div>
				)}

			{plan === "pro" && isOwner && (
				<div className="flex items-center justify-between gap-8 border-t pt-6">
					<div>
						<div className="text-sm font-medium">
							<Trans>Invoices and payment method</Trans>
						</div>
					</div>
					<Button
						variant="outline"
						size="sm"
						className="shrink-0"
						disabled={isOpeningPortal}
						onClick={() => openPortal("general")}
					>
						<Trans>Manage billing</Trans>
					</Button>
				</div>
			)}

			<p className="border-t pt-6 text-sm text-muted-foreground">
				<Trans>
					For questions about billing,{" "}
					<a href={COMPANY.MAIL_TO} className="text-primary hover:underline">
						contact us
					</a>
					.
				</Trans>
			</p>
			<PlanChangeDialog
				change={pendingChange}
				isConfirming={isConfirming}
				onConfirm={confirmChange}
				onDismiss={dismissChange}
			/>
		</div>
	);
}
