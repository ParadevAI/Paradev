import { beforeEach, describe, expect, test } from "bun:test";
import * as billing from "@superset/auth/billing";
import { Webhook } from "svix";
import { stub } from "../../../../../../test/stub";

let synced: string[] = [];
stub(billing, {
	syncOrganizationSubscription: async (organizationId: string) => {
		synced.push(organizationId);
	},
});

const { POST } = await import("./route");

const SECRET = process.env.AUTUMN_WEBHOOK_SECRET as string;

const PLANS_UPDATED = {
	type: "billing.updated",
	data: {
		object: "billing.updated",
		customer_id: "6a1f8f0e-3c2b-4d5e-9f10-111213141516",
		plan_changes: [
			{
				action: "activated",
				subscription: {
					plan_id: "pro",
					status: "active",
					past_due: false,
					started_at: 1761840000000,
					canceled_at: null,
					expires_at: null,
					trial_ends_at: null,
					current_period_start: 1761840000000,
					current_period_end: 1764432000000,
				},
				previous_attributes: null,
				item_changes: [],
			},
		],
		tags: [],
	},
};

function signed(payload: unknown, secret = SECRET): Request {
	const body = JSON.stringify(payload);
	const id = "msg_test";
	const timestamp = new Date();
	const signature = new Webhook(secret).sign(id, timestamp, body);
	return new Request("https://api.test/api/integrations/autumn/webhook", {
		method: "POST",
		body,
		headers: {
			"svix-id": id,
			"svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
			"svix-signature": signature,
		},
	});
}

beforeEach(() => {
	synced = [];
});

describe("Autumn webhook", () => {
	test("a signed billing.updated in Autumn's documented shape syncs that organization", async () => {
		const response = await POST(signed(PLANS_UPDATED));
		expect(response.status).toBe(200);
		expect(synced).toEqual([PLANS_UPDATED.data.customer_id]);
	});

	test("a payload signed with another secret is rejected", async () => {
		const response = await POST(
			signed(PLANS_UPDATED, "whsec_b3RoZXItc2VjcmV0LXZhbHVl"),
		);
		expect(response.status).toBe(401);
		expect(synced).toEqual([]);
	});

	test("events that do not change plans are acknowledged without a sync", async () => {
		const response = await POST(
			signed({
				type: "balances.limit_reached",
				data: { customer_id: PLANS_UPDATED.data.customer_id },
			}),
		);
		expect(response.status).toBe(200);
		expect(synced).toEqual([]);
	});
});
