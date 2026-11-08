import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import {
	familyForPlan,
	isPaymentFailingStatus,
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
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { useBillingActions } from "../../hooks/useBillingActions";
import { usePlanCatalog } from "../../hooks/usePlanCatalog";
import { PlanChangeDialog } from "../PlanChangeDialog";
import { BillingDetails } from "./components/BillingDetails";
import { CloudUsageCard } from "./components/CloudUsageCard";
import { CurrentPlanCard } from "./components/CurrentPlanCard";
import { PaymentFailedBanner } from "./components/PaymentFailedBanner";
import { RecentInvoices } from "./components/RecentInvoices";
import { UpgradeCard } from "./components/UpgradeCard";

interface BillingOverviewProps {
	visibleItems?: SettingItemId[] | null;
}

export function BillingOverview({ visibleItems }: BillingOverviewProps) {
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

	const catalog = usePlanCatalog().data ?? [];
	const upsellFamily = catalog[0];

	const handleUpgrade = async (annual = false) => {
		if (memberCount === undefined) return;
		const target = upsellFamily ? planForInterval(upsellFamily, annual) : null;
		await upgrade({
			planId: target?.id ?? "",
			planName: upsellFamily?.name ?? "",
			annual: target ? target.interval === "year" : annual,
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
					<p className="text-sm text-muted-foreground mt-1">
						<Trans>
							For questions about billing,{" "}
							<a
								href={COMPANY.MAIL_TO}
								className="text-primary hover:underline"
							>
								contact us
							</a>
							.
						</Trans>
					</p>
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
								planName={
									familyForPlan(catalog, activePlan?.autumnPlanId)?.family.name
								}
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
							{plan === "free" && upsellFamily && (
								<UpgradeCard
									family={upsellFamily}
									onUpgrade={() => handleUpgrade(false)}
									isUpgrading={isUpgrading || memberCount === undefined}
								/>
							)}
						</div>
					</div>
				)}
				{showOverview && (
					<CloudUsageCard organizationId={activeOrgId} canBuy={isOwner} />
				)}
				{showOverview && isOwner && plan !== "free" && <BillingDetails />}
				<RecentInvoices />
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
