import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { useNow } from "renderer/hooks/useNow";
import { useStripeLabels } from "../../hooks/useStripeLabels";
import type { CardBlockViewProps } from "../../types";
import { localDay, startOfLocalDay, stripeDate } from "../../utils/stripeDate";
import { stripeMoney } from "../../utils/stripeMoney";
import { ActionButton } from "../ActionButton";
import { DateField } from "../DateField";
import { StripeCustomerHeader } from "../StripeCustomerHeader";
import { StripeField } from "../StripeField";
import { StripeRadio } from "../StripeRadio";

const NOW_TICK_MS = 60_000;

type Flow = "cancel" | "pause";
type When = "now" | "period_end";
type Refund = "none" | "prorated" | "last_payment";
type Behavior = "void" | "keep_as_draft" | "mark_uncollectible";

/** Stripe's cancel and pause dialogs on a subscription the agent wants cancelled or paused. */
export function StripeSubscriptionBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"stripe.subscription">) {
	const { t } = useLingui();
	const now = useNow(NOW_TICK_MS);
	const { cardLabel, customerName, pausedLabel } = useStripeLabels();
	const { subscription, preview, proposed } = view;
	const action = (id: string) => actions.find((entry) => entry.id === id);
	const offered = (["cancel", "pause"] as const).filter((id) => action(id));
	const [chosen, setChosen] = useState<Flow>(view.change);
	const flow = offered.includes(chosen) ? chosen : offered[0];
	const other = offered.find((id) => id !== flow);

	const refunds: Refund[] = [
		"none",
		...(preview.lastPayment ? (["last_payment"] as const) : []),
		...(preview.prorated.amount > 0 ? (["prorated"] as const) : []),
	];
	const [when, setWhen] = useState<When>(proposed.when);
	const [refund, setRefund] = useState<Refund>(
		refunds.includes(proposed.refund) ? proposed.refund : "none",
	);
	const [until, setUntil] = useState(proposed.resumesAt !== null);
	const [resumeDay, setResumeDay] = useState(() =>
		localDay(proposed.resumesAt ?? subscription.currentPeriodEnd),
	);
	const [behavior, setBehavior] = useState<Behavior>(proposed.behavior);

	const who = customerName(view.customer);
	const product = subscription.product;
	const today = stripeDate(now.toISOString());
	const periodEnd = stripeDate(subscription.currentPeriodEnd);
	const prorated = stripeMoney(
		preview.prorated.amount,
		preview.prorated.currency,
	);
	const lastPayment = preview.lastPayment
		? stripeMoney(preview.lastPayment.amount, preview.lastPayment.currency)
		: "";
	const refunded = when === "now" ? refund : "none";
	const back = refunded === "prorated" ? prorated : lastPayment;
	const card = cardLabel(preview.lastPayment?.card ?? view.customer.card);
	const cancelText =
		when === "period_end"
			? t({
					message: `Cancel ${product} for ${who} on ${periodEnd}? No refund.`,
				})
			: refunded === "none"
				? t({ message: `Cancel ${product} for ${who} now? No refund.` })
				: t({
						message: `Cancel ${product} for ${who} now and refund ${back} to ${card}?`,
					});

	const resumesAt = until ? startOfLocalDay(resumeDay) : null;
	const resumeValid =
		resumesAt === null || Date.parse(resumesAt) > now.getTime();
	const resumeDate = resumesAt ? stripeDate(resumesAt) : "";
	const pauseText = resumesAt
		? t({
				message: `Pause payment collection on ${product} for ${who} until ${resumeDate}?`,
			})
		: t({
				message: `Pause payment collection on ${product} for ${who} with no end date?`,
			});
	const cancelLabel = t({
		message: "Cancel",
		context: "when a subscription is canceled",
	});
	const refundLabel = t({
		message: "Refund",
		context: "what is refunded with a cancellation",
	});
	const resumeText = t({
		message: `Resume payment collection on ${product} for ${who}?`,
	});

	return (
		<div className="flex flex-col">
			<StripeCustomerHeader customer={view.customer} account={view.account} />
			{subscription.paused && (
				<div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-[13px] text-foreground">
					<span>{pausedLabel(subscription.paused)}</span>
					{!done && (
						<ActionButton
							action={action("resume")}
							pending={pending}
							variant="outline"
							confirmText={resumeText}
							onClick={() => onAct("resume")}
						>
							<Trans>Resume payment collection</Trans>
						</ActionButton>
					)}
				</div>
			)}
			{!done && flow === "cancel" && (
				<div className="flex flex-col gap-4 border-t border-border px-4 py-4">
					<h3 className="text-[13px] font-semibold text-foreground">
						<Trans>Cancel subscription</Trans>
					</h3>
					<StripeField label={cancelLabel}>
						<StripeRadio
							label={cancelLabel}
							value={when}
							onChange={setWhen}
							disabled={pending}
							options={[
								{
									value: "now",
									label: t({ message: "Immediately" }),
									description: today,
								},
								{
									value: "period_end",
									label: t({ message: "End of the current period" }),
									description: periodEnd,
								},
							]}
						/>
					</StripeField>
					<StripeField label={refundLabel}>
						<StripeRadio
							label={refundLabel}
							value={refunded}
							onChange={setRefund}
							disabled={pending}
							options={(when === "now" ? refunds : (["none"] as const)).map(
								(value) => ({
									value,
									label:
										value === "none"
											? t({ message: "No refund" })
											: value === "last_payment"
												? t({ message: `Last payment ${lastPayment}` })
												: preview.lastPayment
													? t({
															message: `Prorated amount ${prorated} of ${lastPayment}`,
														})
													: t({ message: `Prorated amount ${prorated}` }),
								}),
							)}
						/>
						{when === "period_end" && (
							<p className="text-xs text-muted-foreground">
								<Trans>
									You can't issue a refund here when canceling at the end of the
									period. However, you can still issue a refund manually.
								</Trans>
							</p>
						)}
					</StripeField>
				</div>
			)}
			{!done && flow === "pause" && (
				<div className="flex flex-col gap-4 border-t border-border px-4 py-4">
					<h3 className="text-[13px] font-semibold text-foreground">
						<Trans>Pause payment collection</Trans>
					</h3>
					<StripeField label={<Trans>Duration</Trans>}>
						<StripeRadio
							label={t({ message: "Duration" })}
							value={until ? "until" : "indefinite"}
							onChange={(value) => setUntil(value === "until")}
							disabled={pending}
							options={[
								{
									value: "indefinite",
									label: t({ message: "Indefinite" }),
									description: t({
										message:
											"We'll keep payment collection paused until you resume it.",
									}),
								},
								{
									value: "until",
									label: t({ message: "Until a custom date" }),
									description: t({
										message:
											"We'll automatically resume payment collection on the date you choose.",
									}),
									control: until && (
										<DateField
											value={resumeDay}
											onChange={setResumeDay}
											label={t({ message: "Resume date" })}
											disabled={pending}
											invalid={!resumeValid}
											className="h-8 w-fit rounded-md border border-input px-2 text-[13px] text-foreground aria-invalid:border-destructive disabled:opacity-50"
										/>
									),
								},
							]}
						/>
					</StripeField>
					<StripeField label={<Trans>Invoice behavior</Trans>}>
						<StripeRadio
							label={t({ message: "Invoice behavior" })}
							value={behavior}
							onChange={setBehavior}
							disabled={pending}
							options={[
								{
									value: "keep_as_draft",
									label: t({ message: "Keep invoices as drafts" }),
									description: t({
										message:
											"Invoices will be created as drafts. You can finalize and collect payment later.",
									}),
								},
								{
									value: "mark_uncollectible",
									label: t({ message: "Mark invoices uncollectible" }),
									description: t({
										message:
											"Invoices will be marked uncollectible. No payment will be collected for these periods.",
									}),
								},
								{
									value: "void",
									label: t({ message: "Void invoices" }),
									description: t({
										message:
											"Invoices will be voided. No record of charges will be created for these periods.",
									}),
								},
							]}
						/>
					</StripeField>
				</div>
			)}
			{failure && (
				<p role="alert" className="px-4 pb-3 text-xs text-destructive">
					{failure}
				</p>
			)}
			{!done && (
				<div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">
					{other && (
						<button
							type="button"
							disabled={pending}
							onClick={() => setChosen(other)}
							className="mr-auto text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
						>
							{other === "pause" ? (
								<Trans>Pause payment collection instead</Trans>
							) : (
								<Trans>Cancel subscription instead</Trans>
							)}
						</button>
					)}
					<ActionButton
						action={action("dismiss")}
						pending={pending}
						variant="outline"
						onClick={() => onAct("dismiss")}
					>
						{action("dismiss")?.label}
					</ActionButton>
					{flow === "cancel" && (
						<ActionButton
							action={action("cancel")}
							pending={pending}
							variant="destructive"
							confirmText={cancelText}
							dismissLabel={<Trans>Don't cancel</Trans>}
							onClick={() =>
								onAct("cancel", {
									when,
									refund: refunded,
									...(refunded === "prorated"
										? {
												prorationDate: preview.prorationDate,
												prorated: preview.prorated.amount,
											}
										: {}),
									...(refunded === "last_payment" && preview.lastPayment
										? {
												charge: preview.lastPayment.charge,
												amount: preview.lastPayment.amount,
											}
										: {}),
								})
							}
						>
							<Trans>Cancel subscription</Trans>
						</ActionButton>
					)}
					{flow === "pause" && (
						<ActionButton
							action={action("pause")}
							pending={pending}
							disabled={!resumeValid}
							confirmText={pauseText}
							onClick={() => onAct("pause", { resumesAt, behavior })}
						>
							<Trans>Pause</Trans>
						</ActionButton>
					)}
				</div>
			)}
		</div>
	);
}
