import { useLingui } from "@lingui/react/macro";
import { errorMessage, rawErrorMessage } from "@superset/i18n/errors";

import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { env } from "renderer/env.renderer";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useCurrentPlan } from "renderer/hooks/useCurrentPlan";
import { track } from "renderer/lib/analytics";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

interface UpgradeOptions {
	planId: string;
	planName: string;
	annual: boolean;
	seats: number;
	source: "billing_overview" | "billing_plans";
	returnUrl?: string;
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

export function useBillingActions() {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const activeOrgId = useActiveOrganizationId();
	const { plan, activePlan } = useCurrentPlan();
	const [isUpgrading, setIsUpgrading] = useState(false);
	const [isCanceling, setIsCanceling] = useState(false);
	const [isRestoring, setIsRestoring] = useState(false);
	const [pendingChange, setPendingChange] = useState<PendingPlanChange | null>(
		null,
	);
	const [isConfirming, setIsConfirming] = useState(false);

	const usesAutumn = async () => {
		const known =
			activePlan ??
			(await utils.billing.activePlan.ensureData().catch(() => undefined));
		return known?.billingProvider === "autumn";
	};

	const checkoutPropertiesFor = (options: UpgradeOptions) => ({
		plan: options.planId,
		annual: options.annual,
		seats: options.seats,
		previous_plan: plan,
		source: options.source,
	});

	const trackCheckoutFailed = (
		options: UpgradeOptions,
		status: number | undefined,
		error: unknown,
	) =>
		track("checkout_failed", {
			...checkoutPropertiesFor(options),
			status,
			error: rawErrorMessage(error),
		});

	const attachConfirmed = async (options: UpgradeOptions) => {
		if (!activeOrgId) return;
		await authClient.$fetch<{ paymentUrl: string | null }>("/autumn/attach", {
			method: "POST",
			body: {
				organizationId: activeOrgId,
				planId: options.planId,
				currentPlanId: activePlan?.autumnPlanId ?? null,
				successUrl: `${env.NEXT_PUBLIC_WEB_URL}/settings/billing?success=true`,
				cancelUrl: env.NEXT_PUBLIC_WEB_URL,
				confirmed: true,
			},
			onSuccess: (ctx) => {
				if (ctx.data?.paymentUrl) {
					track("checkout_redirected", checkoutPropertiesFor(options));
					window.open(ctx.data.paymentUrl, "_blank");
				} else {
					toast.success(t({ message: "Plan updated" }));
				}
			},
			onError: (ctx) => {
				trackCheckoutFailed(options, ctx.response?.status, ctx.error);
				toast.error(errorMessage(ctx.error));
			},
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
			await utils.billing.activePlan.invalidate();
		}
	};

	const dismissChange = () => setPendingChange(null);

	const upgrade = async (options: UpgradeOptions) => {
		if (!activeOrgId) return;
		const { planId, annual, seats, returnUrl } = options;
		const checkoutProperties = checkoutPropertiesFor(options);
		track("checkout_started", checkoutProperties);

		const successUrl = `${env.NEXT_PUBLIC_WEB_URL}/settings/billing?success=true`;

		setIsUpgrading(true);
		try {
			if (await usesAutumn()) {
				const { data: preview, error } =
					await authClient.$fetch<PlanChangePreview>("/autumn/previewAttach", {
						method: "POST",
						body: { organizationId: activeOrgId, planId },
					});
				if (error || !preview) {
					trackCheckoutFailed(options, error?.status, error);
					toast.error(errorMessage(error));
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
						trackCheckoutFailed(options, ctx.response?.status, ctx.error),
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
						planId: activePlan?.autumnPlanId ?? "",
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
		pendingChange,
		confirmChange,
		dismissChange,
		isConfirming,
		cancel,
		restore,
		isUpgrading,
		isCanceling,
		isRestoring,
	};
}
