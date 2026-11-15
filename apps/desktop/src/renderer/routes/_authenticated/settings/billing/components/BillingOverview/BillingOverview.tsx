import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import {
	advertisedGbMinutesPerSeat,
	familyForPlan,
	isPaymentFailingStatus,
	type PlanFamily,
	planForInterval,
} from "@superset/shared/billing";
import { COMPANY } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { Link } from "@tanstack/react-router";
import { HiArrowRight } from "react-icons/hi2";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useCurrentPlan } from "renderer/hooks/useCurrentPlan";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { PlanChangeDialog } from "renderer/routes/_authenticated/components/PlanChangeDialog";
import { useBillingActions } from "renderer/routes/_authenticated/hooks/useBillingActions";
import { usePlanCatalog } from "renderer/routes/_authenticated/hooks/usePlanCatalog";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { resolveSubscriptionIsYearly } from "../../utils/resolveSubscriptionIsYearly";
import { BillingDetails } from "./components/BillingDetails";
import { CloudPlansBanner } from "./components/CloudPlansBanner";
import { CloudUsageCard } from "./components/CloudUsageCard";
import { CurrentPlanCard } from "./components/CurrentPlanCard";
import { PaymentFailedBanner } from "./components/PaymentFailedBanner";
import { PlanList } from "./components/PlanList";
import { RecentInvoices } from "./components/RecentInvoices";

interface BillingOverviewProps {
	visibleItems?: SettingItemId[] | null;
	/** Billing was opened for cloud: point at the plans that include it. */
	highlightCloud?: boolean;
}

export function BillingOverview({
	visibleItems,
	highlightCloud = false,
}: BillingOverviewProps) {
	const { formatPrice } = useFormat();

	const { t } = useLingui();
	const { data: session } = authClient.useSession();
	const searchQuery = useSettingsSearchQuery();
	const {
		upgrade,
		cancel: handleCancel,
		restore: handleRestore,
		isUpgrading,
		isCanceling,
		isRestoring,
		pendingChange,
		confirmChange,
		dismissChange,
		isConfirming,
	} = useBillingActions();

	// Ownership must be judged against the org being billed. The session's
	// active organization is shared by every window, so reading membership from
	// it would grant or withhold owner-only billing actions based on whatever
	// org another window happens to be showing. This member list is scoped
	// server-side by the organization header this window sends.
	const { data: members } = cloudTrpc.organization.listMembers.useQuery({
		includeDeactivated: false,
	});
	const currentUserId = session?.user?.id;
	const currentMember = members?.find((m) => m.userId === currentUserId);
	const isOwner = currentMember?.role === "owner";

	const { plan, activePlan } = useCurrentPlan();
	const activeOrgId = useActiveOrganizationId();

	// Seats are billed from this — never derive it from an unresolved query.
	// undefined (not 0) keeps the upgrade action disabled until it loads. It is
	// the same list rendered above, which excludes members pending deletion, so
	// checkout bills exactly the seats the organization can see.
	const memberCount =
		members && members.length > 0 ? members.length : undefined;

	const isPaymentFailing = isPaymentFailingStatus(activePlan?.status);
	const { data: outstandingInvoice } =
		cloudTrpc.billing.outstandingInvoice.useQuery(undefined, {
			enabled: isPaymentFailing,
		});
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const amountDue = outstandingInvoice
		? formatPrice(outstandingInvoice.amountDue, outstandingInvoice.currency)
		: null;

	const showOverview = isItemVisible(
		SETTING_ITEM_ID.BILLING_OVERVIEW,
		visibleItems,
	);

	const { data: organizations } = cloudTrpc.organization.list.useQuery();
	const organizationName = organizations?.find(
		(organization) => organization.id === activeOrgId,
	)?.name;

	const catalog = usePlanCatalog().data ?? [];
	const currentFamily =
		plan === "pro"
			? (familyForPlan(catalog, activePlan?.autumnPlanId)?.family ?? null)
			: null;
	const subscriptionIsYearly = activePlan
		? resolveSubscriptionIsYearly(activePlan)
		: null;
	const subscriptionInterval =
		subscriptionIsYearly === null
			? null
			: subscriptionIsYearly
				? "year"
				: "month";
	const cloudFamilies = catalog.filter(
		(family) => advertisedGbMinutesPerSeat(family) !== null,
	);
	const showCloudPlans =
		highlightCloud &&
		cloudFamilies.length > 0 &&
		!cloudFamilies.some((family) => family.family === currentFamily?.family);
	const highlightedFamilies = new Set(
		showCloudPlans ? cloudFamilies.map((family) => family.family) : [],
	);
	const showPlanList =
		catalog.length > 0 &&
		(plan === "free" ||
			(plan === "pro" &&
				activePlan?.billingProvider === "autumn" &&
				!activePlan?.cancelAt));

	const handleUpgrade = async (family: PlanFamily, yearly: boolean) => {
		const target = planForInterval(family, yearly);
		if (memberCount === undefined || !target) return;
		await upgrade({
			planId: target.id,
			planName: family.name,
			annual: target.interval === "year",
			seats: memberCount,
			source: "billing_overview",
		});
	};

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8 flex items-start justify-between gap-4">
				<div>
					<h2 className="text-xl font-semibold">
						<Trans>Billing</Trans>
					</h2>
					{organizationName && (
						<p className="text-sm text-muted-foreground mt-1">
							{organizationName}
						</p>
					)}
				</div>
				<Button variant="ghost" size="sm" asChild>
					<Link to="/settings/billing/plans">
						<HighlightText
							text={t({
								message: "All plans",
							})}
							query={searchQuery}
						/>
						<HiArrowRight className="h-3 w-3" />
					</Link>
				</Button>
			</div>

			<div className="space-y-6">
				{showOverview && showCloudPlans && (
					<CloudPlansBanner
						planNames={cloudFamilies.map((family) => family.name)}
					/>
				)}
				{isPaymentFailing && (
					<PaymentFailedBanner
						amountDue={amountDue}
						hostedInvoiceUrl={outstandingInvoice?.hostedInvoiceUrl ?? null}
						isOwner={isOwner}
						onPayInvoice={(url) => openUrl.mutate(url)}
					/>
				)}
				{showOverview && (
					<div>
						<h3 className="text-sm font-medium mb-2">
							<Trans context="billing">Plan</Trans>
						</h3>
						<div className="divide-y divide-border">
							<CurrentPlanCard
								currentPlan={plan}
								planName={currentFamily?.name}
								onCancel={handleCancel}
								isCanceling={isCanceling}
								onRestore={handleRestore}
								isRestoring={isRestoring}
								cancelAt={activePlan?.cancelAt}
								nextPlanName={
									activePlan?.scheduledPlanId
										? (familyForPlan(catalog, activePlan.scheduledPlanId)
												?.family.name ?? null)
										: null
								}
								switchAt={activePlan?.scheduledAt}
								periodEnd={activePlan?.periodEnd}
								status={activePlan?.status}
							/>
						</div>
					</div>
				)}
				{showOverview && showPlanList && (
					<PlanList
						catalog={catalog}
						plan={plan}
						currentFamily={currentFamily?.family ?? null}
						subscriptionInterval={subscriptionInterval}
						highlightedFamilies={highlightedFamilies}
						canChangePlan={isOwner}
						isUpgrading={isUpgrading || memberCount === undefined}
						onUpgrade={handleUpgrade}
					/>
				)}
				{showOverview && (
					<CloudUsageCard organizationId={activeOrgId} canBuy={isOwner} />
				)}
				{showOverview && isOwner && plan !== "free" && <BillingDetails />}
				<RecentInvoices />
				<p className="border-t border-border pt-6 text-sm text-muted-foreground">
					<Trans>
						For questions about billing,{" "}
						<a href={COMPANY.MAIL_TO} className="text-primary hover:underline">
							contact us
						</a>
						.
					</Trans>
				</p>
			</div>
			<PlanChangeDialog
				change={pendingChange}
				isConfirming={isConfirming}
				onConfirm={confirmChange}
				onDismiss={dismissChange}
			/>
		</div>
	);
}
