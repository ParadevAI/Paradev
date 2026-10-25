"use client";

import { useLingui } from "@lingui/react/macro";
import { authClient } from "@superset/auth/client";
import { rawErrorMessage } from "@superset/i18n/errors";
import type { PlanTier } from "@superset/shared/billing";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import posthog from "posthog-js";
import { useState } from "react";
import { env } from "@/env";
import { useTRPC } from "@/trpc/react";

type PortalFlowType = "general" | "payment_method_update";

interface UpgradeOptions {
	planId: string;
	planName: string;
	annual: boolean;
	seats: number;
}

export interface PlanChangePreview {
	total: number;
	currency: string;
	lineItems: { displayName: string; description: string; total: number }[];
	nextCycle?: { startsAt: number; total: number };
	incoming: { planId: string; effectiveAt: number | null }[];
	redirectToCheckout: boolean;
}

export interface PendingPlanChange {
	options: UpgradeOptions;
	preview: PlanChangePreview;
}

interface UseBillingActionsOptions {
	activeOrganizationId: string | null | undefined;
	activePlan:
		| {
				billingProvider: "autumn" | "stripe";
				billingInterval: string | null;
				autumnPlanId?: string | null;
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
	const [pendingChange, setPendingChange] = useState<PendingPlanChange | null>(
		null,
	);
	const [isConfirming, setIsConfirming] = useState(false);

	const usesAutumn = activePlan?.billingProvider === "autumn";
	const billingUrl = `${env.NEXT_PUBLIC_WEB_URL}/settings/billing`;
	const currentAutumnPlanId = activePlan?.autumnPlanId ?? "";

	const checkoutPropertiesFor = (options: UpgradeOptions) => ({
		plan: options.planId,
		annual: options.annual,
		seats: options.seats,
		previous_plan: plan,
		source: "web_billing",
	});

	const onCheckoutFailed = (
		options: UpgradeOptions,
		status: number | undefined,
		error: unknown,
	) => {
		posthog.capture("checkout_failed", {
			...checkoutPropertiesFor(options),
			status,
			error: rawErrorMessage(error),
		});
		toast.error(t({ message: "Could not start checkout. Please try again." }));
	};

	const attachConfirmed = async (options: UpgradeOptions) => {
		if (!activeOrganizationId) return;
		await authClient.$fetch<{ paymentUrl: string | null }>("/autumn/attach", {
			method: "POST",
			body: {
				organizationId: activeOrganizationId,
				planId: options.planId,
				currentPlanId: activePlan?.autumnPlanId ?? null,
				successUrl: `${billingUrl}?success=true`,
				cancelUrl: billingUrl,
				confirmed: true,
			},
			onSuccess: (ctx) => {
				if (ctx.data?.paymentUrl) {
					posthog.capture(
						"checkout_redirected",
						checkoutPropertiesFor(options),
					);
					window.location.assign(ctx.data.paymentUrl);
				} else {
					toast.success(t({ message: "Plan updated" }));
				}
			},
			onError: (ctx) =>
				onCheckoutFailed(options, ctx.response?.status, ctx.error),
		});
	};

	const confirmChange = async () => {
		if (!pendingChange) return;
		setIsConfirming(true);
		try {
			await attachConfirmed(pendingChange.options);
			setPendingChange(null);
		} finally {
			setIsConfirming(false);
			await invalidatePlan();
		}
	};

	const dismissChange = () => setPendingChange(null);

	const upgrade = async (options: UpgradeOptions) => {
		if (!activeOrganizationId) return;
		const { planId, annual, seats } = options;
		const checkoutProperties = checkoutPropertiesFor(options);
		posthog.capture("checkout_started", checkoutProperties);

		const successUrl = `${billingUrl}?success=true`;

		setIsUpgrading(true);
		try {
			if (usesAutumn) {
				const { data: preview, error } =
					await authClient.$fetch<PlanChangePreview>("/autumn/previewAttach", {
						method: "POST",
						body: { organizationId: activeOrganizationId, planId },
					});
				if (error || !preview) {
					onCheckoutFailed(options, error?.status, error);
					return;
				}
				if (preview.redirectToCheckout) {
					await attachConfirmed(options);
				} else {
					setPendingChange({ options, preview });
				}
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
					onError: (ctx) =>
						onCheckoutFailed(options, ctx.response?.status, ctx.error),
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

	const openPortal = (flowType: PortalFlowType) => {
		portal.mutate(
			{ flowType },
			{
				onSuccess: ({ url }) => window.location.assign(url),
				onError: showPortalError,
			},
		);
	};

	return {
		upgrade,
		pendingChange,
		confirmChange,
		dismissChange,
		isConfirming,
		cancel,
		restore,
		openPortal,
		isUpgrading,
		isCanceling,
		isRestoring,
		isOpeningPortal: portal.isPending,
	};
}
