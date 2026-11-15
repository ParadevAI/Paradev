import { describe, expect, test } from "bun:test";
import {
	recordUpgradeIntent,
	type UpgradeNudgeDeps,
	type UpgradeNudgeMessage,
	upgradeNudgeFeatureName,
} from "./upgrade-nudge";

function fakeDeps({
	paid = false,
	sendFails = false,
}: {
	paid?: boolean;
	sendFails?: boolean;
} = {}) {
	const claims = new Set<string>();
	const sent: UpgradeNudgeMessage[] = [];
	const captured: string[] = [];
	const deps: UpgradeNudgeDeps = {
		capture: (event) => captured.push(event.outcome),
		isOrganizationPaid: async () => paid,
		isUnsubscribed: async () => false,
		claim: async (userId) => {
			if (claims.has(userId)) return false;
			claims.add(userId);
			return true;
		},
		send: async (message) => {
			if (sendFails) throw new Error("response lost");
			sent.push(message);
		},
	};
	return { deps, sent, captured, expireClaims: () => claims.clear() };
}

const input = {
	user: { id: "user-1", email: "ada@example.com" },
	organizationId: "org-1",
	feature: "mobile",
};

describe("recordUpgradeIntent", () => {
	test("records the hit and sends one nudge naming the feature", async () => {
		const { deps, sent, captured } = fakeDeps();

		expect(await recordUpgradeIntent(input, deps)).toBe("sent");
		expect(captured).toEqual(["sent"]);
		expect(sent).toEqual([
			{ to: "ada@example.com", featureName: "Paradev Mobile" },
		]);
	});

	test("sends no second nudge until the 7-day claim expires", async () => {
		const { deps, sent, captured, expireClaims } = fakeDeps();

		await recordUpgradeIntent(input, deps);
		expect(await recordUpgradeIntent(input, deps)).toBe("rate_limited");
		expect(sent).toHaveLength(1);
		expect(captured).toEqual(["sent", "rate_limited"]);

		expireClaims();
		expect(await recordUpgradeIntent(input, deps)).toBe("sent");
		expect(sent).toHaveLength(2);
	});

	test("keeps the claim when the emit may have reached Resend", async () => {
		const { deps, captured } = fakeDeps({ sendFails: true });

		expect(await recordUpgradeIntent(input, deps)).toBe("failed");
		expect(await recordUpgradeIntent(input, deps)).toBe("rate_limited");
		expect(captured).toEqual(["failed", "rate_limited"]);
	});

	test("skips the nudge when the organization already pays", async () => {
		const { deps, sent, captured } = fakeDeps({ paid: true });

		expect(await recordUpgradeIntent(input, deps)).toBe("paid");
		expect(sent).toHaveLength(0);
		expect(captured).toEqual(["paid"]);
	});

	test("names unknown features without passing client text through", () => {
		expect(upgradeNudgeFeatureName("voice_mode")).toBe("Voice mode");
		expect(upgradeNudgeFeatureName("<a href=x>win</a>")).toBe("a Pro feature");
		expect(upgradeNudgeFeatureName("__proto__")).toBe("a Pro feature");
		expect(upgradeNudgeFeatureName("constructor")).toBe("Constructor");
	});
});
