import { db } from "@superset/db/client";
import { subscriptions } from "@superset/db/schema";
import { MemberRemovedBillingEmail } from "@superset/email/emails/billing/member-removed";
import { NOREPLY_FROM } from "@superset/email/sender";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@superset/shared/billing";
import { Client } from "@upstash/qstash";
import { and, eq, inArray } from "drizzle-orm";
import { billingUsesAutumn } from "../../autumn";
import { env } from "../../env";
import { stripeClient } from "../../stripe";
import {
	countBillableSeats,
	getOrganizationBillingRecipients,
} from "../../utils/billing";
import { previewNextInvoice } from "../../utils/invoice-preview";
import { resend } from "../resend";
import { setAutumnSeats } from "./autumn/seats";
import type { SeatRemovalDeps } from "./seat-removal";
import { NOTIFY_SLACK_URL } from "./subscription-events";

const qstash = new Client({ token: env.QSTASH_TOKEN });

export function seatRemovalDeps(): SeatRemovalDeps {
	return {
		activeSubscription: (organizationId) =>
			db.query.subscriptions.findFirst({
				where: and(
					eq(subscriptions.referenceId, organizationId),
					inArray(subscriptions.status, ACTIVE_SUBSCRIPTION_STATUSES),
				),
			}),
		countSeats: countBillableSeats,
		retrieveStripeSubscription: (subscriptionId) =>
			stripeClient.subscriptions.retrieve(subscriptionId),
		setAutumnSeats: async (organizationId, quantity) =>
			billingUsesAutumn && (await setAutumnSeats(organizationId, quantity)),
		updateStripeSeats: async ({ subscriptionId, itemId, quantity }) => {
			await stripeClient.subscriptions.update(subscriptionId, {
				items: [{ id: itemId, quantity }],
				proration_behavior: "create_prorations",
			});
		},
		billingRecipients: getOrganizationBillingRecipients,
		previewCredit: ({ customerId, subscriptionId, itemId }) =>
			previewNextInvoice(customerId, subscriptionId, itemId, "credit"),
		sendEmails: async (emails) => {
			await resend.batch.send(
				emails.map(({ to, subject, props }) => ({
					from: NOREPLY_FROM,
					to,
					subject,
					react: MemberRemovedBillingEmail(props),
				})),
			);
		},
		notifySlack: async (body) => {
			await qstash.publishJSON({ url: NOTIFY_SLACK_URL, body, retries: 3 });
		},
	};
}
