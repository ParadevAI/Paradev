import { Trans, useLingui } from "@lingui/react/macro";
import type { CardBlockViewProps } from "../../types";
import { ActionButton } from "../ActionButton";
import { StripeCustomerHeader } from "../StripeCustomerHeader";
import { StripeFacts } from "../StripeFacts";
import { StripeInvoiceSummary } from "../StripeInvoiceSummary";

/** An invoice the agent wants sent, marked as paid, marked uncollectible, or voided. */
export function StripeInvoiceBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"stripe.invoice">) {
	const { t } = useLingui();
	const action = (id: string) => actions.find((entry) => entry.id === id);
	return (
		<div className="flex flex-col">
			<StripeCustomerHeader customer={view.customer} account={view.account} />
			<div className="flex flex-col gap-1.5 border-t border-border px-4 py-3">
				<StripeInvoiceSummary invoice={view.invoice} />
				<StripeFacts
					rows={[
						view.to !== null && {
							label: t({ message: "Send to" }),
							value: view.to,
						},
					]}
				/>
				{!done && !view.account.live && view.to !== null && action("send") && (
					<p className="text-xs text-muted-foreground">
						<Trans>
							In sandbox mode, emails can only be sent to addresses with access
							to this sandbox.
						</Trans>
					</p>
				)}
			</div>
			{failure && (
				<p role="alert" className="px-4 pb-3 text-xs text-destructive">
					{failure}
				</p>
			)}
			{!done && (
				<div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
					<ActionButton
						action={action("dismiss")}
						pending={pending}
						variant="outline"
						onClick={() => onAct("dismiss")}
					>
						<Trans>Leave it</Trans>
					</ActionButton>
					<ActionButton
						action={action("void")}
						pending={pending}
						variant="destructive"
						onClick={() => onAct("void")}
					>
						<Trans>Void invoice</Trans>
					</ActionButton>
					<ActionButton
						action={action("mark_uncollectible")}
						pending={pending}
						variant="outline"
						onClick={() => onAct("mark_uncollectible")}
					>
						<Trans>Mark uncollectible</Trans>
					</ActionButton>
					<ActionButton
						action={action("mark_paid")}
						pending={pending}
						variant="outline"
						onClick={() => onAct("mark_paid")}
					>
						<Trans>Mark as paid</Trans>
					</ActionButton>
					<ActionButton
						action={action("send")}
						pending={pending}
						onClick={() => onAct("send")}
					>
						{view.invoice.status === "draft" ? (
							<Trans>Send invoice</Trans>
						) : (
							<Trans>Send again</Trans>
						)}
					</ActionButton>
				</div>
			)}
		</div>
	);
}
