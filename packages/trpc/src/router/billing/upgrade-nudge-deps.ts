import { db } from "@superset/db/client";
import { organizations } from "@superset/db/schema";
import { UpgradeNudgeEmail } from "@superset/email/emails/billing/upgrade-nudge";
import { NOREPLY_FROM } from "@superset/email/sender";
import { Redis } from "@upstash/redis";
import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { env } from "../../env";
import { posthog } from "../../lib/analytics";
import { organizationPlan } from "../../lib/billing/plan";
import {
	UPGRADE_NUDGE_INTERVAL_SECONDS,
	type UpgradeNudgeDeps,
} from "./upgrade-nudge";

const resend = new Resend(env.RESEND_API_KEY);
const redis =
	env.KV_REST_API_URL && env.KV_REST_API_TOKEN
		? new Redis({ url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN })
		: null;

const claimKey = (userId: string) => `upgrade-nudge:${userId}`;

function requireRedis(): Redis {
	if (!redis) throw new Error("KV is not configured");
	return redis;
}

export const upgradeNudgeDeps: UpgradeNudgeDeps = {
	capture({ userId, organizationId, feature, outcome }) {
		posthog.capture({
			distinctId: userId,
			event: "upgrade_intent_recorded",
			properties: { feature, outcome, organizationId },
		});
	},

	async isOrganizationPaid(organizationId) {
		return (await organizationPlan(organizationId)) !== "free";
	},

	async isUnsubscribed(email) {
		const contact = await resend.contacts.get({ email });
		if (contact.error?.name === "not_found") return false;
		if (contact.error) throw new Error(contact.error.message);
		return Boolean(contact.data?.unsubscribed);
	},

	async claim(userId) {
		const result = await requireRedis().set(claimKey(userId), Date.now(), {
			nx: true,
			ex: UPGRADE_NUDGE_INTERVAL_SECONDS,
		});
		return result === "OK";
	},

	async release(userId) {
		await requireRedis().del(claimKey(userId));
	},

	async send({ to, recipientName, featureName, organizationId }) {
		const organization = organizationId
			? await db.query.organizations.findFirst({
					where: eq(organizations.id, organizationId),
					columns: { name: true },
				})
			: null;
		const message = {
			from: NOREPLY_FROM,
			to,
			subject: `${featureName} is part of Paradev Pro`,
			react: UpgradeNudgeEmail({
				recipientName,
				featureName,
				organizationName: organization?.name ?? null,
				upgradeUrl: `${env.NEXT_PUBLIC_WEB_URL}/settings/billing`,
			}),
		};
		if (env.NODE_ENV !== "production") {
			console.info(
				`[billing/upgrade-nudge] not sending outside production: ${message.subject}`,
			);
			return;
		}
		const { error } = await resend.emails.send(message);
		if (error) throw new Error(error.message);
	},
};
