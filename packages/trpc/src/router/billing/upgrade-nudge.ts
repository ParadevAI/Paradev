import { BRAND } from "@superset/shared/brand";

export const UPGRADE_NUDGE_INTERVAL_SECONDS = 7 * 24 * 60 * 60;

const FEATURE_NAMES: Record<string, string> = {
	"mobile-app": `${BRAND.NAME} Mobile`,
	"invite-members": "Inviting teammates",
	"cloud-workspaces": "Cloud workspaces",
};

const SAFE_FEATURE_ID = /^[a-z0-9]+(?:[_.-][a-z0-9]+)*$/i;

export function upgradeNudgeFeatureName(feature: string): string {
	const known = Object.hasOwn(FEATURE_NAMES, feature)
		? FEATURE_NAMES[feature]
		: undefined;
	if (known) return known;
	if (!SAFE_FEATURE_ID.test(feature)) return "a Pro feature";
	const words = feature.replace(/[_.-]+/g, " ").toLowerCase();
	return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface UpgradeNudgeMessage {
	to: string;
	featureName: string;
}

export interface UpgradeNudgeDeps {
	capture(event: {
		userId: string;
		organizationId: string | null;
		feature: string;
		outcome: UpgradeNudgeOutcome;
	}): void;
	isOrganizationPaid(organizationId: string): Promise<boolean>;
	isUnsubscribed(email: string): Promise<boolean>;
	/** Reads the user's 7-day slot without taking it. */
	isClaimed(userId: string): Promise<boolean>;
	/** Takes the user's slot for the next 7 days; false when it is taken. */
	claim(userId: string): Promise<boolean>;
	/** Hands the nudge to the Resend automation, which adds the unsubscribe link. */
	send(message: UpgradeNudgeMessage): Promise<void>;
}

export type UpgradeNudgeOutcome =
	| "sent"
	| "paid"
	| "unsubscribed"
	| "rate_limited"
	| "failed";

export async function recordUpgradeIntent(
	input: {
		user: { id: string; email: string };
		organizationId: string | null;
		feature: string;
	},
	deps: UpgradeNudgeDeps,
): Promise<UpgradeNudgeOutcome> {
	const outcome = await nudge(input, deps);
	deps.capture({
		userId: input.user.id,
		organizationId: input.organizationId,
		feature: input.feature,
		outcome,
	});
	return outcome;
}

async function nudge(
	{ user, organizationId, feature }: Parameters<typeof recordUpgradeIntent>[0],
	deps: UpgradeNudgeDeps,
): Promise<UpgradeNudgeOutcome> {
	try {
		if (await deps.isClaimed(user.id)) return "rate_limited";
		if (organizationId && (await deps.isOrganizationPaid(organizationId))) {
			return "paid";
		}
		if (await deps.isUnsubscribed(user.email)) return "unsubscribed";
		if (!(await deps.claim(user.id))) return "rate_limited";
		await deps.send({
			to: user.email,
			featureName: upgradeNudgeFeatureName(feature),
		});
		return "sent";
	} catch (error) {
		console.error(`[billing/upgrade-nudge] ${user.id} nudge failed`, error);
		return "failed";
	}
}
