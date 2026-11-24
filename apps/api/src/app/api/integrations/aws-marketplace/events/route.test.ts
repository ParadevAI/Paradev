import { beforeEach, describe, expect, test } from "bun:test";
import * as marketplace from "@superset/auth/billing/aws-marketplace";
import { stub } from "../../../../../../test/stub";

const TOKEN = "t".repeat(40);
let eventsToken: string | null = TOKEN;
let syncs: Array<[unknown, unknown]> = [];
stub(marketplace, {
	awsMarketplaceConfig: () => ({
		productCode: "prod-code",
		sellerAccountId: "615082100823",
		eventsToken,
		enterprisePlanId: "enterprise",
	}),
	syncAwsMarketplaceLicense: async (locator: unknown, options: unknown) => {
		syncs.push([locator, options]);
		return "synced";
	},
});

const { POST } = await import("./route");

function event(detailType: string) {
	return {
		"detail-type": detailType,
		source: "aws.agreement-marketplace",
		account: "615082100823",
		detail: {
			license: { arn: "arn:license" },
			product: { code: "prod-code" },
		},
	};
}

function post(payload: unknown, token: string | null = TOKEN): Request {
	return new Request(
		"https://api.test/api/integrations/aws-marketplace/events",
		{
			method: "POST",
			headers: token ? { "x-aws-marketplace-token": token } : {},
			body: JSON.stringify(payload),
		},
	);
}

beforeEach(() => {
	eventsToken = TOKEN;
	syncs = [];
});

describe("AWS Marketplace events", () => {
	test("License Updated re-reads the license's entitlements", async () => {
		const response = await POST(post(event("License Updated - Manufacturer")));
		expect(response.status).toBe(200);
		expect(syncs).toEqual([[{ licenseArn: "arn:license" }, { revoke: false }]]);
	});

	test("License Deprovisioned revokes access", async () => {
		await POST(post(event("License Deprovisioned - Manufacturer")));
		expect(syncs).toEqual([[{ licenseArn: "arn:license" }, { revoke: true }]]);
	});

	test("rejects a request without the API destination token", async () => {
		expect(
			(await POST(post(event("License Updated - Manufacturer"), null))).status,
		).toBe(401);
		expect(
			(
				await POST(
					post(event("License Updated - Manufacturer"), "x".repeat(40)),
				)
			).status,
		).toBe(401);
		expect(syncs).toEqual([]);
	});

	test("acknowledges events it does not act on", async () => {
		const response = await POST(
			post(event("Purchase Agreement Created - Manufacturer")),
		);
		expect(response.status).toBe(200);
		expect(syncs).toEqual([]);
	});

	test("answers 404 while no events token is configured", async () => {
		eventsToken = null;
		expect(
			(await POST(post(event("License Updated - Manufacturer")))).status,
		).toBe(404);
	});
});
