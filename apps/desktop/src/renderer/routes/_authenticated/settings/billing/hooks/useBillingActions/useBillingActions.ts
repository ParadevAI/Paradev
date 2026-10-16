import { useLingui } from "@lingui/react/macro";
import { rawErrorMessage } from "@superset/i18n/errors";
import { autumnProPlanId } from "@superset/shared/billing";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { env } from "renderer/env.renderer";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useCurrentPlan } from "renderer/hooks/useCurrentPlan";
import { track } from "renderer/lib/analytics";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

interface UpgradeOptions {
	annual: boolean;
	seats: number;
	source: "billing_overview" | "billing_plans";
	returnUrl?: string;
}

export function useBillingActions() {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const activeOrgId = useActiveOrganizationId();
	const { plan, activePlan } = useCurrentPlan();
	const [isUpgrading, setIsUpgrading] = useState(false);
	const [isCanceling, setIsCanceling] = useState(false);
	const [isRestoring, setIsRestoring] = useState(false);

	const usesAutumn = async () => {
		const known =
			activePlan ??
			(await utils.billing.activePlan.ensureData().catch(() => undefined));
		return known?.billingProvider === "autumn";
	};

	const currentAutumnPlanId = () =>
		autumnProPlanId({ annual: activePlan?.billingInterval === "year" });

	const upgrade = async ({
		annual,
		seats,
		source,
		returnUrl,
	}: UpgradeOptions) => {
		if (!activeOrgId) return;

		const checkoutProperties = {
			plan: "pro",
			annual,
			seats,
			previous_plan: plan,
			source,
		};
		track("checkout_started", checkoutProperties);

		const successUrl = `${env.NEXT_PUBLIC_WEB_URL}/settings/billing?success=true`;
		const trackCheckoutFailed = (status: number | undefined, error: unknown) =>
			track("checkout_failed", {
				...checkoutProperties,
				status,
				error: rawErrorMessage(error),
			});

		setIsUpgrading(true);
		try {
			if (await usesAutumn()) {
				await authClient.$fetch<{ paymentUrl: string | null }>(
					"/autumn/attach",
					{
						method: "POST",
						body: {
							organizationId: activeOrgId,
							planId: autumnProPlanId({ annual }),
							successUrl,
							cancelUrl: env.NEXT_PUBLIC_WEB_URL,
						},
						onSuccess: (ctx) => {
							if (ctx.data?.paymentUrl) {
								track("checkout_redirected", checkoutProperties);
								window.open(ctx.data.paymentUrl, "_blank");
							} else {
								toast.success(t({ message: "Plan updated" }));
							}
						},
						onError: (ctx) =>
							trackCheckoutFailed(ctx.response?.status, ctx.error),
					},
				);
				return;
			}

			await authClient.subscription.upgrade(
				{
					plan: "pro",
					referenceId: activeOrgId,
					annual,
					seats,
					successUrl,
					cancelUrl: env.NEXT_PUBLIC_WEB_URL,
					...(returnUrl !== undefined && { returnUrl }),
					disableRedirect: true,
				},
				{
					onSuccess: (ctx) => {
						if (ctx.data?.url) {
							track("checkout_redirected", checkoutProperties);
							window.open(ctx.data.url, "_blank");
						}
					},
					// Better Auth resolves rather than throws, so without this hook a
					// failed checkout is invisible: the button just resets.
					onError: (ctx) =>
						trackCheckoutFailed(ctx.response?.status, ctx.error),
				},
			);
		} finally {
			setIsUpgrading(false);
			await utils.billing.activePlan.invalidate();
		}
	};

	const cancel = async () => {
		if (!activeOrgId) return;

		setIsCanceling(true);
		try {
			if (await usesAutumn()) {
				await authClient.$fetch("/autumn/updateSubscription", {
					method: "POST",
					body: {
						organizationId: activeOrgId,
						planId: currentAutumnPlanId(),
						cancelAction: "cancel_end_of_cycle",
					},
				});
				return;
			}

			await authClient.subscription.cancel(
				{
					referenceId: activeOrgId,
					returnUrl: env.NEXT_PUBLIC_WEB_URL,
				},
				{
					onSuccess: (ctx) => {
						if (ctx.data?.url) {
							window.open(ctx.data.url, "_blank");
						}
					},
				},
			);
		} finally {
			setIsCanceling(false);
			await utils.billing.activePlan.invalidate();
		}
	};

	const restore = async () => {
		if (!activeOrgId) return;

		setIsRestoring(true);
		try {
			if (await usesAutumn()) {
				await authClient.$fetch("/autumn/updateSubscription", {
					method: "POST",
					body: {
						organizationId: activeOrgId,
						planId: currentAutumnPlanId(),
						cancelAction: "uncancel",
					},
					onSuccess: () => {
						toast.success(t({ message: "Plan restored" }));
					},
				});
				return;
			}

			await authClient.subscription.restore({
				referenceId: activeOrgId,
			});
			toast.success(t({ message: "Plan restored" }));
		} finally {
			setIsRestoring(false);
			await utils.billing.activePlan.invalidate();
		}
	};

	return {
		upgrade,
		cancel,
		restore,
		isUpgrading,
		isCanceling,
		isRestoring,
	};
}
