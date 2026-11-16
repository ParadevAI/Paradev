import { Redis } from "@upstash/redis";
import { Resend } from "resend";
import { env } from "../../env";
import { posthog } from "../../lib/analytics";
import { organizationPlan } from "../../lib/billing/plan";
import {
	UPGRADE_NUDGE_INTERVAL_SECONDS,
	type UpgradeNudgeDeps,
} from "./upgrade-nudge";

export const UPGRADE_NUDGE_EVENT = "billing.upgrade_nudge_due";

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

	async isClaimed(userId) {
		return (await requireRedis().exists(claimKey(userId))) === 1;
	},

	async claim(userId) {
		const result = await requireRedis().set(claimKey(userId), Date.now(), {
			nx: true,
			ex: UPGRADE_NUDGE_INTERVAL_SECONDS,
		});
		return result === "OK";
	},

	async send({ to, featureName }) {
		if (env.NODE_ENV !== "production") {
			console.info(
				`[billing/upgrade-nudge] not emitting ${UPGRADE_NUDGE_EVENT} outside production`,
			);
			return;
		}
		const { error } = await resend.events.send({
			event: UPGRADE_NUDGE_EVENT,
			email: to,
			payload: {
				featureName,
				upgradeUrl: `${env.NEXT_PUBLIC_WEB_URL}/settings/billing`,
			},
		});
		if (error) throw new Error(error.message);
	},
};
