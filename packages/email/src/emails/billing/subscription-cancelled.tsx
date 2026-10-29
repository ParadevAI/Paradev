import { Hr, Link, Text } from "@react-email/components";
import { COMPANY } from "@superset/shared/constants";
import { format } from "date-fns";
import { DetailRow, EmailLayout } from "../../components";

interface SubscriptionCancelledEmailProps {
	recipientName?: string | null;
	organizationName: string;
	planName: string;
	accessEndsAt: Date;
	/** Stripe gave up collecting and cancelled the subscription. Access is
	 * already gone, so none of the "until <date>" copy applies. */
	dueToPaymentFailure?: boolean;
}

// Resubscribing only exists on the desktop billing page — there is no web
// route for it — so this email points there in words rather than shipping a
// button that lands on the agents page.
export function SubscriptionCancelledEmail({
	recipientName = "there",
	organizationName = "Acme Inc",
	planName = "Pro",
	accessEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
	dueToPaymentFailure = false,
}: SubscriptionCancelledEmailProps) {
	const formattedEndDate = format(accessEndsAt, "MMMM d, yyyy");

	return (
		<EmailLayout
			preview={
				dueToPaymentFailure
					? `Your ${planName} subscription ended`
					: `Your ${planName} subscription has been cancelled`
			}
		>
			<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
				Hi {recipientName ?? "there"},
			</Text>

			{dueToPaymentFailure ? (
				<>
					<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
						We tried several times to charge the payment method on file for{" "}
						<strong>{organizationName}</strong>'s <strong>{planName}</strong>{" "}
						subscription and couldn't, so the subscription has ended and the
						organization is now on the free plan.
					</Text>

					<Text className="text-[15px] leading-6 text-foreground m-0 mb-6">
						Nothing has been deleted. Open Paradev and go to{" "}
						<strong>Settings → Billing</strong> to resubscribe with a working
						card and {planName} turns straight back on.
					</Text>
				</>
			) : (
				<>
					<Text className="text-[15px] leading-6 text-foreground m-0 mb-2">
						Your <strong>{planName}</strong> subscription for{" "}
						<strong>{organizationName}</strong> has been cancelled.
					</Text>

					<Hr className="border-border my-4" />
					<DetailRow label="Access until" value={formattedEndDate} />
					<Hr className="border-border my-4" />

					<Text className="text-[15px] leading-6 text-foreground m-0 mb-4">
						You keep all {planName} features until {formattedEndDate}. After
						that, your organization moves to the free plan.
					</Text>

					<Text className="text-[15px] leading-6 text-foreground m-0 mb-6">
						Changed your mind? You can resubscribe anytime before your access
						ends from <strong>Settings → Billing</strong> in Paradev.
					</Text>
				</>
			)}

			<Text className="text-[13px] leading-5 text-muted m-0">
				If something wasn't working, please{" "}
				<Link href={COMPANY.MAIL_TO} className="text-muted underline">
					tell us
				</Link>
				.
			</Text>
		</EmailLayout>
	);
}

export default SubscriptionCancelledEmail;
