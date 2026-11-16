import { describe, expect, spyOn, test } from "bun:test";
import {
	type SeatRemoval,
	type SeatRemovalDeps,
	syncSeatsAfterRemoval,
} from "./seat-removal";

const LEFT: SeatRemoval = {
	organization: { id: "org-1", name: "Acme" },
	member: { name: "Alice", email: "alice@example.com" },
	how: { kind: "left" },
};

function fakeDeps(overrides: Partial<SeatRemovalDeps> = {}) {
	const calls: { method: string; args: unknown }[] = [];
	const record =
		<T>(method: string, result: T) =>
		async (args: unknown) => {
			calls.push({ method, args });
			return result;
		};
	const deps: SeatRemovalDeps = {
		activeSubscription: async () => ({
			stripeSubscriptionId: "sub_1",
			plan: "pro",
		}),
		countSeats: async () => 3,
		retrieveStripeSubscription: async () => ({
			customer: "cus_1",
			items: {
				data: [
					{
						id: "si_seat",
						price: {
							unit_amount: 2000,
							currency: "usd",
							recurring: { interval: "month", usage_type: "licensed" },
						},
					},
				],
			} as never,
		}),
		setAutumnSeats: async (organizationId, quantity) => {
			calls.push({
				method: "setAutumnSeats",
				args: { organizationId, quantity },
			});
			return false;
		},
		updateStripeSeats: record("updateStripeSeats", undefined),
		billingRecipients: async () => [
			{ name: "Owner", email: "owner@example.com" },
		],
		previewCredit: async () => null,
		sendEmails: record("sendEmails", undefined),
		notifySlack: record("notifySlack", undefined),
		...overrides,
	};
	return { deps, calls };
}

describe("syncSeatsAfterRemoval", () => {
	test("sets the recounted seats on Stripe and tells billing the member left", async () => {
		const { deps, calls } = fakeDeps();

		await syncSeatsAfterRemoval(LEFT, deps);

		expect(calls.find((c) => c.method === "updateStripeSeats")?.args).toEqual({
			subscriptionId: "sub_1",
			itemId: "si_seat",
			quantity: 3,
		});
		expect(calls.find((c) => c.method === "sendEmails")?.args).toMatchObject([
			{
				to: "owner@example.com",
				subject: "Billing update: Member left Acme",
				props: { removedByName: null, newSeatCount: 3 },
			},
		]);
		expect(calls.find((c) => c.method === "notifySlack")?.args).toMatchObject({
			eventType: "seat_removed",
			previousSeats: 4,
			newSeats: 3,
		});
	});

	test("tells billing an admin removed the member, and a Slack failure does not fail it", async () => {
		const { deps, calls } = fakeDeps({
			notifySlack: async () => {
				throw new Error("qstash down");
			},
		});
		const logged = spyOn(console, "error").mockImplementation(() => {});

		try {
			await syncSeatsAfterRemoval(
				{ ...LEFT, how: { kind: "removed", by: "A team admin" } },
				deps,
			);

			expect(calls.find((c) => c.method === "sendEmails")?.args).toMatchObject([
				{
					subject: "Billing update: Member removed from Acme",
					props: { removedByName: "A team admin" },
				},
			]);
		} finally {
			logged.mockRestore();
		}
	});

	test("a failed seat write reaches the caller", async () => {
		const { deps } = fakeDeps({
			updateStripeSeats: async () => {
				throw new Error("stripe down");
			},
		});

		await expect(syncSeatsAfterRemoval(LEFT, deps)).rejects.toThrow(
			"stripe down",
		);
	});

	test("a failed billing email still sends the Slack event and reaches the caller", async () => {
		const { deps, calls } = fakeDeps({
			sendEmails: async () => {
				throw new Error("Resend rate_limit_exceeded: Too many requests");
			},
		});

		await expect(syncSeatsAfterRemoval(LEFT, deps)).rejects.toThrow(
			"rate_limit_exceeded",
		);
		expect(calls.map((c) => c.method)).toContain("notifySlack");
	});

	test("writes seats to Autumn and not Stripe when Autumn owns them", async () => {
		const { deps, calls } = fakeDeps({ setAutumnSeats: async () => true });

		await syncSeatsAfterRemoval(LEFT, deps);

		expect(calls.map((c) => c.method)).not.toContain("updateStripeSeats");
	});

	test("leaves an organization without a seat subscription alone", async () => {
		for (const subscription of [
			undefined,
			{ stripeSubscriptionId: null, plan: "pro" },
			{ stripeSubscriptionId: "sub_1", plan: "enterprise" },
		]) {
			const { deps, calls } = fakeDeps({
				activeSubscription: async () => subscription,
			});

			await syncSeatsAfterRemoval(LEFT, deps);

			expect(calls).toEqual([]);
		}
	});
});
