import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { useFormat } from "@superset/i18n/react";
import {
	familyForPlan,
	gbHourPackPricePerGbHour,
	offersYearlyDiscount,
	PLAN_PRICE_CURRENCY,
	type PlanFamily,
	planForInterval,
	seatPricePerMonth,
} from "@superset/shared/billing";
import { COMPANY } from "@superset/shared/constants";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Switch } from "@superset/ui/switch";
import { cn } from "@superset/ui/utils";
import { createFileRoute, Link } from "@tanstack/react-router";
import { differenceInDays, format } from "date-fns";
import { Fragment, useState } from "react";
import { HiArrowLeft, HiArrowUpRight, HiCheck } from "react-icons/hi2";
import { env } from "renderer/env.renderer";
import { useCurrentPlan } from "renderer/hooks/useCurrentPlan";
import { track } from "renderer/lib/analytics";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { PlanChangeDialog } from "../components/PlanChangeDialog";
import { useBillingActions } from "../hooks/useBillingActions";
import { usePlanCatalog } from "../hooks/usePlanCatalog";

export const Route = createFileRoute("/_authenticated/settings/billing/plans/")(
	{
		component: PlansPage,
	},
);

type PlanCardAction =
	| "current"
	| "upgrade"
	| "downgrade"
	| "restore"
	| "contact";

type PlanCardText =
	| { monthly: MessageDescriptor; yearly: MessageDescriptor }
	| MessageDescriptor;

type PlanCardActionButton = {
	action: PlanCardAction;
	variant: "default" | "secondary" | "outline";
	size?: "default" | "sm";
	fullWidth?: boolean;
	align?: "center" | "start";
};

type PlanCardData = {
	id: string;
	name: MessageDescriptor | string;
	family?: PlanFamily;
	price: PlanCardText | "seat";
	priceNote?: PlanCardText;
	billingText: PlanCardText;
	showBillingToggle?: boolean;
	actions: Array<PlanCardActionButton & { label: MessageDescriptor }>;
};

type ComparisonValue = MessageDescriptor | boolean | null;

type ComparisonRow = {
	label: MessageDescriptor;
	href?: string;
	values: [free: ComparisonValue, paid: ComparisonValue, enterprise: ComparisonValue];
	cloudGbHours?: boolean;
	cloudPack?: boolean;
	badge?: { label: MessageDescriptor; variant: "default" | "secondary" };
};

type ComparisonSection = {
	title: MessageDescriptor;
	rows: ComparisonRow[];
};

const LABEL_COLUMN_WIDTH = 180;
const PLAN_COLUMN_MIN_WIDTH = 144;

const FREE_CARD: PlanCardData = {
	id: "free",
	name: msg({ message: "Free" }),
	price: msg({ message: "$0" }),
	priceNote: msg({
		message: "per user/month",
	}),
	billingText: msg({
		message: "Free for everyone",
	}),
	actions: [
		{
			label: msg({
				message: "Current plan",
			}),
			action: "current",
			variant: "secondary",
		},
	],
};

const ENTERPRISE_CARD: PlanCardData = {
	id: "enterprise",
	name: msg({
		message: "Enterprise",
	}),
	price: msg({
		message: "Custom pricing",
	}),
	billingText: msg({
		message: "Billed yearly",
	}),
	actions: [
		{
			label: msg({
				message: "Request a trial",
			}),
			action: "contact",
			variant: "outline",
		},
	],
};

function paidCard(family: PlanFamily): PlanCardData {
	const yearly = offersYearlyDiscount(family);
	return {
		id: family.family,
		name: family.name,
		family,
		price: "seat",
		priceNote: msg({
			message: "per user/month",
		}),
		billingText: yearly
			? {
					monthly: msg({
						message: "Billed monthly",
					}),
					yearly: msg({
						message: "Billed yearly",
					}),
				}
			: msg({
					message: "Billed monthly",
				}),
		showBillingToggle: yearly,
		actions: [
			{
				label: msg({
					message: "Upgrade",
				}),
				action: "upgrade",
				variant: "default",
			},
		],
	};
}

const VALUE_ONE = msg({
	message: "1",
});
const VALUE_UNLIMITED = msg({
	message: "Unlimited",
});

const COMPARISON_SECTIONS: ComparisonSection[] = [
	{
		title: msg({ message: "Usage" }),
		rows: [
			{
				label: msg({
					message: "Team members",
				}),
				values: [VALUE_ONE, VALUE_UNLIMITED, VALUE_UNLIMITED],
			},
			{
				label: msg({
					message: "Workspaces",
				}),
				values: [VALUE_UNLIMITED, VALUE_UNLIMITED, VALUE_UNLIMITED],
			},
			{
				label: msg({
					message: "Projects",
				}),
				values: [VALUE_UNLIMITED, VALUE_UNLIMITED, VALUE_UNLIMITED],
			},
			{
				label: msg({
					message: "Cloud GB-hours per seat each month",
				}),
				values: [null, null, msg({ message: "Custom" })],
				cloudGbHours: true,
				badge: { label: msg({ message: "Beta" }), variant: "secondary" },
			},
			{
				label: msg({
					message: "Extra GB-hours, bought as needed",
				}),
				values: [null, null, msg({ message: "Custom" })],
				cloudPack: true,
				badge: { label: msg({ message: "Beta" }), variant: "secondary" },
			},
		],
	},
	{
		title: msg({
			message: "Features",
		}),
		rows: [
			{
				label: msg({
					message: "Desktop app",
				}),
				values: [true, true, true],
			},
			{
				label: msg({
					message: "Local workspaces",
				}),
				values: [true, true, true],
			},
			{
				label: msg({
					message: "GitHub integration",
				}),
				values: [true, true, true],
			},
			{
				label: msg({
					message: "Remote access",
				}),
				values: [null, true, true],
			},
			{
				label: msg({
					message: "Automations",
				}),
				values: [null, true, true],
			},
			{
				label: msg({
					message: "Mobile app",
				}),
				values: [null, true, true],
				href: COMPANY.APP_STORE_URL,
			},
			{
				label: msg({
					message: "Linear integration",
				}),
				values: [null, true, true],
			},
			{
				label: msg({
					message: "Slack integration",
				}),
				values: [null, true, true],
			},
			{
				label: msg({
					message: "Team collaboration",
				}),
				values: [null, true, true],
			},
		],
	},
	{
		title: msg({
			message: "Support",
		}),
		rows: [
			{
				label: msg({
					message: "Priority support",
				}),
				values: [null, true, true],
			},
			{
				label: msg({
					message: "Uptime SLA",
				}),
				values: [null, null, true],
			},
			{
				label: msg({
					message: "Custom contracts",
				}),
				values: [null, null, true],
			},
		],
	},
	{
		title: msg({
			message: "Security",
		}),
		rows: [
			{
				label: msg({
					message: "SSO/SAML",
				}),
				values: [null, null, true],
			},
			{
				label: msg({
					message: "IP restrictions",
				}),
				values: [null, null, true],
			},
			{
				label: msg({
					message: "SCIM provisioning",
				}),
				values: [null, null, true],
			},
			{
				label: msg({
					message: "Audit log",
				}),
				values: [null, null, true],
			},
		],
	},
];

/**
 * Whether the subscription bills yearly, or null when there is nothing to read
 * it from — no subscription yet, or a row predating `billingInterval`, where
 * the period length is the only signal.
 */
function resolveSubscriptionIsYearly(activePlan: {
	billingInterval?: string | null;
	periodStart?: Date | null;
	periodEnd?: Date | null;
}): boolean | null {
	const interval = activePlan.billingInterval;
	if (interval === "year" || interval === "yearly") return true;
	if (interval === "month" || interval === "monthly") return false;

	if (activePlan.periodStart && activePlan.periodEnd) {
		return (
			differenceInDays(
				new Date(activePlan.periodEnd),
				new Date(activePlan.periodStart),
			) > 60
		);
	}

	return null;
}

function PlansPage() {
	// Seeded from the subscription, not hardcoded: showing Annual to a monthly
	// subscriber turned the Pro column's "Current plan" into a live
	// "Change to Annual" that bills a year up front. A manual toggle wins from
	// then on, and Annual stays the default for free and enterprise, which have
	// no interval to read.
	const { t } = useLingui();
	const { formatCurrency, formatNumber } = useFormat();
	const catalogQuery = usePlanCatalog();
	const catalog = catalogQuery.data ?? [];
	const [manualIsYearly, setManualIsYearly] = useState<boolean | null>(null);
	const {
		upgrade,
		cancel,
		restore,
		isUpgrading,
		isCanceling,
		isRestoring,
		pendingChange,
		confirmChange,
		dismissChange,
		isConfirming,
	} = useBillingActions();
	const openUrl = electronTrpc.external.openUrl.useMutation();

	const { plan: currentPlan, isReady: planResolved, activePlan } = useCurrentPlan();
	const cancelAt = activePlan?.cancelAt;
	const currentColumn =
		currentPlan === "pro"
			? (familyForPlan(catalog, activePlan?.autumnPlanId)?.family.family ??
				"pro")
			: currentPlan;
	const planCards = [FREE_CARD, ...catalog.map(paidCard), ENTERPRISE_CARD];

	const subscriptionIsYearly = activePlan
		? resolveSubscriptionIsYearly(activePlan)
		: null;
	const isYearly = manualIsYearly ?? subscriptionIsYearly ?? true;
	const setIsYearly = setManualIsYearly;

	// Explicit, not defaulted: this list is what checkout bills, and it must be
	// the same definition of a seat the subscription hooks use.
	const { data: membersData } = cloudTrpc.organization.listMembers.useQuery({
		includeDeactivated: false,
	});
	// Seats are billed from this — never derive it from an unresolved query.
	const memberCount =
		membersData && membersData.length > 0 ? membersData.length : undefined;

	const cardName = (card: PlanCardData) =>
		typeof card.name === "string" ? card.name : i18n._(card.name);
	const currentPlanCard = planCards.find((card) => card.id === currentColumn);
	const currentPlanLabel = currentPlanCard ? cardName(currentPlanCard) : "";

	const getValue = <T,>(value: T | { monthly: T; yearly: T }): T => {
		if (typeof value === "object" && value !== null && "monthly" in value) {
			return isYearly ? value.yearly : value.monthly;
		}
		return value as T;
	};

	const yearlyFor = (card: PlanCardData) =>
		card.family ? isYearly && offersYearlyDiscount(card.family) : isYearly;
	
	const getPriceLabel = (plan: PlanCardData): string => {
		if (plan.price !== "seat") return i18n._(getValue(plan.price));
		if (!plan.family) return "";
		return formatCurrency(
			seatPricePerMonth(plan.family, isYearly),
			PLAN_PRICE_CURRENCY,
			{ minimumFractionDigits: 0 },
		);
	};

	const comparisonValueFor = (
		row: ComparisonRow,
		plan: PlanCardData,
	): ComparisonValue | string => {
		if (row.cloudGbHours && plan.family) {
			const gbMinutes = plan.family.gbMinutesPerSeat;
			return gbMinutes ? formatNumber(gbMinutes / 60) : null;
		}
		if (row.cloudPack && plan.family) {
			const pack = plan.family.pack;
			return pack
				? t({
						message: `${formatCurrency(gbHourPackPricePerGbHour(pack), PLAN_PRICE_CURRENCY, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} per GB-hour`,
					})
				: null;
		}
		if (plan.id === FREE_CARD.id) return row.values[0];
		if (plan.id === ENTERPRISE_CARD.id) return row.values[2];
		return row.values[1];
	};

	const handlePlanAction = async (
		action: PlanCardAction,
		plan: PlanCardData,
	) => {
		if (action === "current") {
			return;
		}

		if (action === "contact") {
			track("enterprise_trial_requested", { source: "billing_plans" });
			openUrl.mutate(COMPANY.MAIL_TO);
			return;
		}

		if (action === "downgrade") {
			await cancel();
			return;
		}

		if (action === "restore") {
			await restore();
			return;
		}

		if (memberCount === undefined) return;

		const target = plan.family ? planForInterval(plan.family, isYearly) : null;
		if (!target) return;
		await upgrade({
			planId: target.id,
			planName: plan.family?.name ?? target.name,
			annual: target.interval === "year",
			seats: memberCount,
			source: "billing_plans",
			returnUrl: env.NEXT_PUBLIC_WEB_URL,
		});
	};

	const renderComparisonValue = (value: ComparisonValue | string) => {
		if (value === null || value === false) {
			return (
				<span className="sr-only">
					<Trans>Not included</Trans>
				</span>
			);
		}

		if (value === true) {
			return <HiCheck className="h-3.5 w-3.5 text-muted-foreground" />;
		}

		return (
			<>
				<HiCheck className="h-3.5 w-3.5 text-muted-foreground" />
				<span className="text-sm">
					{typeof value === "string" ? value : i18n._(value)}
				</span>
			</>
		);
	};

	const highlightColumnIndex = Math.max(
		1,
		planCards.findIndex((card) => card.id === currentColumn),
	);
	const highlightColumnStart = highlightColumnIndex + 2;
	const gridStyle = {
		gridTemplateColumns: `${LABEL_COLUMN_WIDTH}px repeat(${planCards.length}, minmax(0, 1fr))`,
	};

	return (
		<div className="p-6 max-w-7xl w-full">
			<div className="mb-6 space-y-4">
				<Button variant="ghost" size="sm" asChild>
					<Link to="/settings/billing">
						<HiArrowLeft className="h-4 w-4" />
						<Trans>Billing</Trans>
					</Link>
				</Button>
				<div>
					<h2 className="text-xl font-semibold">
						<Trans>Plans</Trans>
					</h2>
					<p className="text-sm text-muted-foreground mt-1">
						<Trans>
							You are on the{" "}
							<span className="text-foreground font-medium">
								{currentPlanLabel} plan
							</span>
							. If you have any questions or would like further support with
							your plan,{" "}
							<button
								type="button"
								onClick={() => {
									track("billing_support_contacted", {
										source: "billing_plans_inline",
									});
									openUrl.mutate(COMPANY.MAIL_TO);
								}}
								className="inline-flex items-center gap-1 text-primary hover:underline"
							>
								contact us
								<HiArrowUpRight className="h-3 w-3" />
							</button>
							.
						</Trans>
					</p>
				</div>
			</div>

			{catalogQuery.isError && (
				<div className="mb-4 flex items-center gap-3 text-sm text-muted-foreground">
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
			<div className="overflow-x-auto">
				<div
					className="relative"
					style={{
						minWidth: LABEL_COLUMN_WIDTH + planCards.length * PLAN_COLUMN_MIN_WIDTH,
					}}
				>
					<div
						className="grid pointer-events-none absolute inset-0"
						style={gridStyle}
					>
						<div
							className="bg-accent/30 border border-border/60 rounded-lg"
							style={{
								gridColumn: `${highlightColumnStart} / ${highlightColumnStart + 1}`,
								gridRow: "span 3",
							}}
						/>
					</div>
					<div className="grid relative z-10 items-start" style={gridStyle}>
						{(["plan", "billing", "cta"] as const).map((rowKey, rowIndex) => (
							<Fragment key={rowKey}>
								<div
									className={cn("px-2", rowKey === "cta" ? "py-3" : "py-2.5")}
								/>
								{planCards.map((plan) => {
									const isCurrent = currentColumn === plan.id;
									const isDowngrade =
										plan.id === "free" && currentPlan !== "free";
									const isOnEnterprise = currentPlan === "enterprise";

									let planActions: Array<
										PlanCardActionButton & { label: string }
									>;
									if (isOnEnterprise) {
										planActions = [
											{
												label: isCurrent
													? t({
															message: "Current plan",
														})
													: t({
															message: "Included in Enterprise",
														}),
												action: "current" as const,
												variant: "secondary" as const,
											},
										];
									} else if (isCurrent && cancelAt) {
										planActions = [
											{
												label: isRestoring
													? t({
															message: "Restoring...",
														})
													: t({
															message: "Restore plan",
														}),
												action: "restore" as const,
												variant: "default" as const,
											},
										];
									} else if (isCurrent && plan.family) {
										// Before the plan resolves the billing interval is unknown,
										// so an interval-change action here would be a guess the
										// user can act on. Hold at "Current plan" until it lands — and
										// equally when the row carries no readable interval.
										const intervalMatches =
											subscriptionIsYearly === null || yearlyFor(plan) === subscriptionIsYearly;
										if (!planResolved || intervalMatches) {
											planActions = [
												{
													label: t({
														message: "Current plan",
													}),
													action: "current" as const,
													variant: "secondary" as const,
												},
											];
										} else {
											planActions = [
												{
													label: isUpgrading
														? t({
																message: "Changing...",
															})
														: yearlyFor(plan)
															? t({
																	message: "Change to Annual",
																})
															: t({
																	message: "Change to Monthly",
																}),
													action: "upgrade" as const,
													variant: "default" as const,
												},
											];
										}
									} else if (isCurrent) {
										planActions = [
											{
												label: t({
													message: "Current plan",
												}),
												action: "current" as const,
												variant: "secondary" as const,
											},
										];
									} else if (isDowngrade && cancelAt) {
										planActions = [
											{
												label: t({
													message: `Starts ${cancelAt ? format(new Date(cancelAt), "MMMM d, yyyy") : ""}`,
												}),
												action: "current" as const,
												variant: "outline" as const,
											},
										];
									} else if (isDowngrade) {
										planActions = [
											{
												label: isCanceling
													? t({
															message: "Downgrading...",
														})
													: t({
															message: "Downgrade to Free",
														}),
												action: "downgrade" as const,
												variant: "outline" as const,
											},
										];
									} else if (currentPlan === "pro" && plan.family) {
										planActions = [
											{
												label: isUpgrading
													? t({
															message: "Changing...",
														})
													: t({
															message: "Switch plan",
														}),
												action: "upgrade" as const,
												variant: "outline" as const,
											},
										];
									} else {
										planActions = plan.actions.map((action) => ({
											...action,
											label: i18n._(action.label),
										}));
									}

									if (rowKey === "plan") {
										return (
											<div key={plan.id} className="px-4 py-2.5">
												<div className="space-y-0.5">
													<div className="text-base font-medium">
														{cardName(plan)}
													</div>
													<div
														className={cn(
															plan.priceNote
																? "text-xl font-semibold leading-tight"
																: "text-base font-medium text-muted-foreground",
														)}
													>
														{getPriceLabel(plan)}
													</div>
													{plan.priceNote && (
														<div className="text-xs text-muted-foreground">
															{i18n._(getValue(plan.priceNote))}
														</div>
													)}
												</div>
											</div>
										);
									}

									if (rowKey === "billing") {
										return (
											<div
												key={plan.id}
												className="flex items-center gap-2 px-4 py-2.5 text-xs text-muted-foreground"
											>
												{plan.showBillingToggle && (
													<Switch
														checked={isYearly}
														onCheckedChange={setIsYearly}
														aria-label={t({
															message: "Billed yearly",
														})}
													/>
												)}
												<span>{i18n._(getValue(plan.billingText))}</span>
											</div>
										);
									}

									return (
										<div key={plan.id} className="px-4 py-3">
											<div className="flex flex-col gap-2">
												{planActions.map((action) => (
													<Button
														key={action.label}
														variant={action.variant}
														size={action.size ?? "sm"}
														className={cn(
															action.fullWidth === false ? "w-fit" : "w-full",
															action.align === "center" && "self-center",
															action.align === "start" && "self-start",
														)}
														disabled={
															action.action === "current" ||
															(action.action === "upgrade" && isUpgrading)
														}
														onClick={() =>
															handlePlanAction(action.action, plan)
														}
													>
														{action.label}
													</Button>
												))}
											</div>
										</div>
									);
								})}

								{rowIndex < 2 && (
									<>
										<div />
										<div
											className="h-px bg-border/60"
											style={{ gridColumn: "2 / -1" }}
										/>
									</>
								)}
							</Fragment>
						))}

						{COMPARISON_SECTIONS.map((section, sectionIndex) => (
							<Fragment key={section.title.id}>
								<div
									className="pt-6 pb-3 px-2"
									style={{ gridColumn: "1 / -1" }}
								>
									<span className="text-sm font-semibold">
										{i18n._(section.title)}
									</span>
								</div>
								<div className="h-px bg-border/60" style={{ gridColumn: "1 / -1" }} />

								{section.rows.map((row, rowIndex) => {
									const isLastRow =
										sectionIndex === COMPARISON_SECTIONS.length - 1 &&
										rowIndex === section.rows.length - 1;

									return (
										<Fragment key={row.label.id}>
											<div className="flex items-center gap-1.5 px-2 py-2.5 text-xs text-muted-foreground">
												{row.href ? (
													<a
														href={row.href}
														target="_blank"
														rel="noopener noreferrer"
														className="underline underline-offset-4 hover:text-foreground"
													>
														{i18n._(row.label)}
													</a>
												) : (
													i18n._(row.label)
												)}
												{row.badge && (
													<Badge
														variant={row.badge.variant}
														className="px-1.5 py-0 text-[10px] font-medium"
													>
														{i18n._(row.badge.label)}
													</Badge>
												)}
											</div>
											{planCards.map((plan) => (
												<div
													key={`${row.label.id}-${plan.id}`}
													className="flex items-center justify-start gap-2 px-4 py-2.5"
												>
													{renderComparisonValue(comparisonValueFor(row, plan))}
												</div>
											))}
											{!isLastRow && (
												<div className="h-px bg-border/60" style={{ gridColumn: "1 / -1" }} />
											)}
										</Fragment>
									);
								})}
							</Fragment>
						))}
					</div>
				</div>
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
