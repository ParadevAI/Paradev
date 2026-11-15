import { describe, expect, test } from "bun:test";
import {
	recordUpgradeIntent,
	type UpgradeNudgeDeps,
	type UpgradeNudgeMessage,
} from "./upgrade-nudge";

function fakeDeps({ paid = false }: { paid?: boolean } = {}) {
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
		release: async (userId) => {
			claims.delete(userId);
		},
		send: async (message) => {
			sent.push(message);
		},
	};
	return { deps, sent, captured, expireClaims: () => claims.clear() };
}

const input = {
	user: { id: "user-1", email: "ada@example.com", name: "Ada" },
	organizationId: "org-1",
	feature: "mobile",
};

describe("recordUpgradeIntent", () => {
	test("records the hit and sends one nudge naming the feature", async () => {
		const { deps, sent, captured } = fakeDeps();

		expect(await recordUpgradeIntent(input, deps)).toBe("sent");
		expect(captured).toEqual(["sent"]);
		expect(sent).toEqual([
			{
				to: "ada@example.com",
				recipientName: "Ada",
				featureName: "Paradev Mobile",
				organizationId: "org-1",
			},
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

	test("skips the nudge when the organization already pays", async () => {
		const { deps, sent, captured } = fakeDeps({ paid: true });

		expect(await recordUpgradeIntent(input, deps)).toBe("paid");
		expect(sent).toHaveLength(0);
		expect(captured).toEqual(["paid"]);
	});
});
