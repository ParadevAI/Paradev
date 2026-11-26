import { describe, expect, test } from "bun:test";
import {
	type EnrichedSubscription,
	firstSourceFromPersonProperties,
	formatPlanChanged,
	formatSubscriptionCancelled,
	formatSubscriptionStarted,
	type PreviousPlan,
	planChangeDirection,
	planLabel,
} from "./slack-blocks";

function createEnrichedSubscription(
	overrides: Partial<EnrichedSubscription> = {},
): EnrichedSubscription {
	return {
		organizationName: "Acme",
		planName: "Pro",
		stripeCustomerId: "cus_123",
		stripeSubscriptionId: "sub_123",
		seatCount: 3,
		pricePerSeatCents: 2000,
		currency: "usd",
		interval: "monthly",
		discount: null,
		accessEndsAt: new Date("2026-05-31T00:00:00.000Z"),
		cancellationDetails: null,
		customerEmail: "founder@acme.com",
		...overrides,
	};
}

describe("formatSubscriptionCancelled", () => {
	test("includes Stripe cancellation details in Slack blocks", () => {
		const blocks = formatSubscriptionCancelled(
			createEnrichedSubscription({
				cancellationDetails: {
					comment: "Missing an admin approval workflow.",
					feedback: "missing_features",
					reason: "cancellation_requested",
				},
			}),
		);

		const serializedBlocks = JSON.stringify(blocks);

		expect(serializedBlocks).toContain(
			"*Cancellation reason:*\\nMissing features",
		);
		expect(serializedBlocks).toContain(
			"*Stripe reason:*\\nCancellation requested",
		);
		expect(serializedBlocks).toContain(
			"*Comment:*\\nMissing an admin approval workflow.",
		);
		expect(serializedBlocks).toContain("*Email:*\\nfounder@acme.com");
	});

	test("renders N/A when the customer email is missing", () => {
		const blocks = formatSubscriptionCancelled(
			createEnrichedSubscription({ customerEmail: null }),
		);

		expect(JSON.stringify(blocks)).toContain("*Email:*\\nN/A");
	});

	test("renders unknown Stripe cancellation values without throwing", () => {
		const blocks = formatSubscriptionCancelled(
			createEnrichedSubscription({
				cancellationDetails: {
					comment: null,
					feedback: "pricing_changed",
					reason: "account_closed",
				},
			}),
		);

		const serializedBlocks = JSON.stringify(blocks);

		expect(serializedBlocks).toContain(
			"*Cancellation reason:*\\nPricing changed",
		);
		expect(serializedBlocks).toContain("*Stripe reason:*\\nAccount closed");
	});

	test("escapes unknown cancellation feedback and reason values", () => {
		const blocks = formatSubscriptionCancelled(
			createEnrichedSubscription({
				cancellationDetails: {
					comment: null,
					feedback: "<@U123>",
					reason: "<!subteam^S123>",
				},
			}),
		);

		const serializedBlocks = JSON.stringify(blocks);

		expect(serializedBlocks).not.toContain("<@U123>");
		expect(serializedBlocks).not.toContain("<!subteam^S123>");
		expect(serializedBlocks).toContain(`&lt;@${"\u200B"}U123&gt;`);
		expect(serializedBlocks).toContain("&lt;!subteam^S123&gt;");
	});

	test("escapes and truncates cancellation comments for Slack", () => {
		const longComment = `<!channel> & <https://example.com|link> ${"a".repeat(510)}`;
		const blocks = formatSubscriptionCancelled(
			createEnrichedSubscription({
				cancellationDetails: {
					comment: longComment,
					feedback: "other",
					reason: "cancellation_requested",
				},
			}),
		);

		const serializedBlocks = JSON.stringify(blocks);

		expect(serializedBlocks).toContain("&lt;!channel&gt;");
		expect(serializedBlocks).toContain("&amp;");
		expect(serializedBlocks).toContain("&lt;https://example.com|link&gt;");
		expect(serializedBlocks).toContain("...");
	});
});

describe("planLabel", () => {
	test("capitalizes a known plan", () => {
		expect(planLabel("pro")).toBe("Pro");
	});

	test("falls back to Unknown when the plan is missing", () => {
		expect(planLabel(null)).toBe("Unknown");
		expect(planLabel(undefined)).toBe("Unknown");
	});
});

describe("formatPlanChanged", () => {
	const previous: PreviousPlan = {
		planName: "Pro",
		pricePerSeatCents: 2000,
		interval: "monthly",
		seatCount: 3,
	};

	test("labels a move to a more expensive plan as an upgrade", () => {
		const blocks = formatPlanChanged(
			createEnrichedSubscription({ planName: "Team", pricePerSeatCents: 6000 }),
			previous,
		);
		const serialized = JSON.stringify(blocks);

		expect(serialized).toContain("Plan Upgraded");
		expect(serialized).toContain("Pro -> Team");
		expect(serialized).toContain("$20.00/seat/mo -> $60.00/seat/mo");
	});

	test("compares yearly and monthly prices per month", () => {
		const enriched = createEnrichedSubscription({
			pricePerSeatCents: 18000,
			interval: "yearly",
		});

		expect(planChangeDirection(enriched, previous)).toBe("downgrade");
	});

	test("keeps the generic header without a previous price", () => {
		const blocks = formatPlanChanged(
			createEnrichedSubscription(),
			null,
			"yearly",
		);
		const serialized = JSON.stringify(blocks);

		expect(serialized).toContain("Plan Changed");
		expect(serialized).toContain("yearly -> monthly");
	});
});

describe("formatSubscriptionStarted", () => {
	test("shows the signup date and first source", () => {
		const blocks = formatSubscriptionStarted(createEnrichedSubscription(), {
			signedUpAt: new Date("2026-11-20T23:30:00.000Z"),
			firstSource: "chatgpt.com",
		});

		const serializedBlocks = JSON.stringify(blocks);

		expect(serializedBlocks).toContain(
			"*Signed up:*\\n<!date^1795217400^{date_short}|2026-11-20>",
		);
		expect(serializedBlocks).toContain("*First source:*\\nchatgpt.com");
	});

	test("shows Unknown when the subscriber profile is missing", () => {
		const blocks = formatSubscriptionStarted(createEnrichedSubscription(), {
			signedUpAt: null,
			firstSource: null,
		});

		const serializedBlocks = JSON.stringify(blocks);

		expect(serializedBlocks).toContain("*Signed up:*\\nUnknown");
		expect(serializedBlocks).toContain("*First source:*\\nUnknown");
	});
});

describe("firstSourceFromPersonProperties", () => {
	test("prefers the first UTM source over the referring domain", () => {
		expect(
			firstSourceFromPersonProperties({
				$initial_utm_source: "chatgpt.com",
				$initial_referring_domain: "$direct",
				$initial_current_url: "https://paradev.com/",
			}),
		).toBe("chatgpt.com");
	});

	test("labels a direct first visit and adds the self-reported source", () => {
		expect(
			firstSourceFromPersonProperties({
				$initial_referring_domain: "$direct",
				$initial_current_url: "https://paradev.com/",
				acquisition_source: "friend_or_colleague",
			}),
		).toBe("Direct (self-reported: Friend or colleague)");
	});

	test("ignores sign-in redirects, our own sites and app-only first visits", () => {
		for (const properties of [
			{
				$initial_referring_domain: "accounts.google.com",
				$initial_current_url: "https://app.paradev.com/auth/desktop/success",
			},
			{
				$initial_referring_domain: "paradev.com",
				$initial_current_url: "https://app.paradev.com/sign-in",
			},
			{
				$initial_referring_domain: "$direct",
				$initial_current_url: "file:///Applications/Paradev.app/index.html",
			},
		]) {
			expect(firstSourceFromPersonProperties(properties)).toBeNull();
		}
	});

	test("returns null when the person has no source properties", () => {
		expect(firstSourceFromPersonProperties({})).toBeNull();
		expect(firstSourceFromPersonProperties(null)).toBeNull();
	});
});
