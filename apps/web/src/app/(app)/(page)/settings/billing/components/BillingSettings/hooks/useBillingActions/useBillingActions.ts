"use client";

import { useLingui } from "@lingui/react/macro";
import { authClient } from "@superset/auth/client";
import { rawErrorMessage } from "@superset/i18n/errors";
import type { PlanTier } from "@superset/shared/billing";
import { autumnProPlanId } from "@superset/shared/billing";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import posthog from "posthog-js";
import { useState } from "react";
import { env } from "@/env";
import { useTRPC } from "@/trpc/react";

type PortalFlowType = "general" | "payment_method_update";

interface UseBillingActionsOptions {
	activeOrganizationId: string | null | undefined;
	activePlan:
		| {
				billingProvider: "autumn" | "stripe";
				billingInterval: string | null;
		  }
		| undefined;
	plan: PlanTier;
	invalidatePlan: () => Promise<unknown>;
}

export function useBillingActions({
	activeOrganizationId,
	activePlan,
	plan,
	invalidatePlan,
}: UseBillingActionsOptions) {
	const { t } = useLingui();
	const trpc = useTRPC();
	const portal = useMutation(trpc.billing.portal.mutationOptions());
	const [isUpgrading, setIsUpgrading] = useState(false);
	const [isCanceling, setIsCanceling] = useState(false);
	const [isRestoring, setIsRestoring] = useState(false);
	const [isOpeningAutumnPortal, setIsOpeningAutumnPortal] = useState(false);

	const usesAutumn = activePlan?.billingProvider === "autumn";
	const billingUrl = `${env.NEXT_PUBLIC_WEB_URL}/settings/billing`;
	const currentAutumnPlanId = autumnProPlanId({
		annual: activePlan?.billingInterval === "year",
	});

	const upgrade = async ({
		annual,
		seats,
	}: {
		annual: boolean;
		seats: number;
	}) => {
		if (!activeOrganizationId) return;

		const checkoutProperties = {
			plan: "pro",
			annual,
			seats,
			previous_plan: plan,
			source: "web_billing",
		};
		posthog.capture("checkout_started", checkoutProperties);

		const successUrl = `${billingUrl}?success=true`;
		const onCheckoutFailed = (status: number | undefined, error: unknown) => {
			posthog.capture("checkout_failed", {
				...checkoutProperties,
				status,
				error: rawErrorMessage(error),
			});
			toast.error(
				t({ message: "Could not start checkout. Please try again." }),
			);
		};

		setIsUpgrading(true);
		try {
			if (usesAutumn) {
				await authClient.$fetch<{ paymentUrl: string | null }>(
					"/autumn/attach",
					{
						method: "POST",
						body: {
							organizationId: activeOrganizationId,
							planId: autumnProPlanId({ annual }),
							successUrl,
							cancelUrl: billingUrl,
						},
						onSuccess: (ctx) => {
							if (ctx.data?.paymentUrl) {
								posthog.capture("checkout_redirected", checkoutProperties);
								window.location.assign(ctx.data.paymentUrl);
							} else {
								toast.success(t({ message: "Plan updated" }));
							}
						},
						onError: (ctx) => onCheckoutFailed(ctx.response?.status, ctx.error),
					},
				);
				return;
			}

			await authClient.subscription.upgrade(
				{
					plan: "pro",
					referenceId: activeOrganizationId,
					annual,
					seats,
					successUrl,
					cancelUrl: billingUrl,
					returnUrl: billingUrl,
					disableRedirect: true,
				},
				{
					onSuccess: (ctx) => {
						if (ctx.data?.url) {
							posthog.capture("checkout_redirected", checkoutProperties);
							window.location.assign(ctx.data.url);
						}
					},
					onError: (ctx) => onCheckoutFailed(ctx.response?.status, ctx.error),
				},
			);
		} finally {
			setIsUpgrading(false);
			await invalidatePlan();
		}
	};

	const cancel = async () => {
		if (!activeOrganizationId) return;
		setIsCanceling(true);
		try {
			if (usesAutumn) {
				await authClient.$fetch("/autumn/updateSubscription", {
					method: "POST",
					body: {
						organizationId: activeOrganizationId,
						planId: currentAutumnPlanId,
						cancelAction: "cancel_end_of_cycle",
					},
				});
				return;
			}

			await authClient.subscription.cancel(
				{
					referenceId: activeOrganizationId,
					returnUrl: billingUrl,
				},
				{
					onSuccess: (ctx) => {
						if (ctx.data?.url) window.location.assign(ctx.data.url);
					},
				},
			);
		} finally {
			setIsCanceling(false);
			await invalidatePlan();
		}
	};

	const restore = async () => {
		if (!activeOrganizationId) return;
		setIsRestoring(true);
		try {
			if (usesAutumn) {
				await authClient.$fetch("/autumn/updateSubscription", {
					method: "POST",
					body: {
						organizationId: activeOrganizationId,
						planId: currentAutumnPlanId,
						cancelAction: "uncancel",
					},
					onSuccess: () => {
						toast.success(t({ message: "Plan restored" }));
					},
				});
				return;
			}

			await authClient.subscription.restore({
				referenceId: activeOrganizationId,
			});
			toast.success(t({ message: "Plan restored" }));
		} finally {
			setIsRestoring(false);
			await invalidatePlan();
		}
	};

	const showPortalError = () => {
		toast.error(t({ message: "Could not open billing. Please try again." }));
	};

	const openPortal = async (flowType: PortalFlowType) => {
		if (!usesAutumn) {
			portal.mutate(
				{ flowType },
				{
					onSuccess: ({ url }) => window.location.assign(url),
					onError: showPortalError,
				},
			);
			return;
		}

		setIsOpeningAutumnPortal(true);
		try {
			await authClient.$fetch<{ url: string }>("/autumn/openCustomerPortal", {
				method: "POST",
				body: {
					organizationId: activeOrganizationId ?? undefined,
					returnUrl: billingUrl,
				},
				onSuccess: (ctx) => window.location.assign(ctx.data.url),
				onError: showPortalError,
			});
		} finally {
			setIsOpeningAutumnPortal(false);
		}
	};

	return {
		upgrade,
		cancel,
		restore,
		openPortal,
		isUpgrading,
		isCanceling,
		isRestoring,
		isOpeningPortal: portal.isPending || isOpeningAutumnPortal,
	};
}
