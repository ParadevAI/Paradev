import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { LuExternalLink } from "react-icons/lu";
import { useStripeLabels } from "../../hooks/useStripeLabels";
import type { CardBlockViewProps, StripeEvidenceView } from "../../types";
import { stripeMoney } from "../../utils/stripeMoney";
import { ActionButton } from "../ActionButton";
import { StripeChargeFacts } from "../StripeChargeFacts";
import { StripeCustomerHeader } from "../StripeCustomerHeader";
import { StripeFacts } from "../StripeFacts";
import { StripeStatus } from "../StripeStatus";
import { DisputeDeadline } from "./components/DisputeDeadline";
import { EvidenceField } from "./components/EvidenceField";

const OPEN = new Set(["needs_response", "warning_needs_response"]);
const LONG_MAX = 8000;
const SHORT_MAX = 300;

/** A dispute or an inquiry to answer: what the bank asks, by when, and the evidence that goes back. */
export function StripeDisputeBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"stripe.dispute">) {
	const { t } = useLingui();
	const { disputeReason } = useStripeLabels();
	const { dispute } = view;
	const [evidence, setEvidence] = useState(view.evidence);
	const action = (id: string) => actions.find((entry) => entry.id === id);
	const submit = action("submit");
	const save = action("save");
	const readOnly = done || dispute.submissions > 0 || !OPEN.has(dispute.status);
	const writable = [submit, save].some((entry) => entry && !entry.disabled);
	const accept = action("accept");
	const refund = action("refund");

	const fields: {
		key: keyof StripeEvidenceView;
		label: string;
		long: boolean;
	}[] = [
		{
			key: "product_description",
			label: t({ message: "Product description" }),
			long: true,
		},
		{
			key: "customer_name",
			label: t({ message: "Customer name" }),
			long: false,
		},
		{
			key: "customer_email_address",
			label: t({ message: "Customer email" }),
			long: false,
		},
		{
			key: "billing_address",
			label: t({ message: "Billing address" }),
			long: false,
		},
		{
			key: "service_date",
			label: t({ message: "Service date" }),
			long: false,
		},
		{
			key: "access_activity_log",
			label: t({ message: "Access activity log" }),
			long: true,
		},
		{
			key: "uncategorized_text",
			label: t({ message: "Additional information" }),
			long: true,
		},
	];

	return (
		<div className="flex flex-col">
			<StripeCustomerHeader customer={view.customer} account={view.account} />
			<div className="flex flex-col gap-3 border-t border-border px-4 py-3">
				<div className="flex flex-col gap-1">
					<h3 className="text-[13px] font-semibold text-foreground">
						{dispute.inquiry ? (
							<Trans>There was an inquiry on this payment</Trans>
						) : (
							<Trans>The customer disputed this payment</Trans>
						)}
					</h3>
					{dispute.inquiry && (
						<p className="text-xs text-muted-foreground">
							<Trans>
								No funds have been withdrawn from your account yet, but the
								cardholder's bank is requesting more information to decide
								whether to return these funds to the cardholder.
							</Trans>
						</p>
					)}
				</div>
				<StripeFacts
					rows={[
						{
							label: t({ message: "Disputed amount" }),
							value: (
								<span className="flex flex-wrap items-center gap-2">
									<a
										href={dispute.url}
										target="_blank"
										rel="noreferrer"
										className="inline-flex items-center gap-1 font-medium tabular-nums underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground"
									>
										{stripeMoney(dispute.amount, dispute.currency)}
										<LuExternalLink className="size-3 opacity-60" />
									</a>
									<StripeStatus status={dispute.status} />
								</span>
							),
						},
						{
							label: t({ message: "Reason" }),
							value: disputeReason(dispute.reason),
						},
						dispute.dueBy !== null && {
							label: t({ message: "Deadline" }),
							value: (
								<DisputeDeadline
									dueBy={dispute.dueBy}
									pastDue={dispute.pastDue}
								/>
							),
						},
					]}
				/>
				<StripeChargeFacts charge={view.charge} />
			</div>
			<div className="flex flex-col gap-4 border-t border-border px-4 py-4">
				{fields.map((field) => (
					<EvidenceField
						key={field.key}
						label={field.label}
						value={evidence[field.key]}
						onChange={(value) =>
							setEvidence((held) => ({ ...held, [field.key]: value }))
						}
						long={field.long}
						maxLength={field.long ? LONG_MAX : SHORT_MAX}
						drafted={!readOnly && view.drafted.includes(field.key)}
						readOnly={readOnly}
						disabled={pending || !writable}
					/>
				))}
			</div>
			{failure && (
				<p role="alert" className="px-4 pb-3 text-xs text-destructive">
					{failure}
				</p>
			)}
			{!done && (
				<div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
					<ActionButton
						action={accept}
						pending={pending}
						variant="destructive"
						onClick={() => onAct("accept")}
					>
						{accept?.label}
					</ActionButton>
					<ActionButton
						action={refund}
						pending={pending}
						variant="destructive"
						onClick={() => onAct("refund")}
					>
						{refund?.label}
					</ActionButton>
					{!readOnly && (
						<>
							<ActionButton
								action={save}
								pending={pending}
								variant="outline"
								onClick={() => onAct("save", { evidence })}
							>
								{save?.label}
							</ActionButton>
							<ActionButton
								action={submit}
								pending={pending}
								onClick={() => onAct("submit", { evidence })}
							>
								{submit?.label}
							</ActionButton>
						</>
					)}
				</div>
			)}
		</div>
	);
}
