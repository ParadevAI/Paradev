import { beforeEach, describe, expect, test } from "bun:test";
import * as marketplace from "@superset/auth/billing/aws-marketplace";
import { stub } from "../../../../../../test/stub";

let configured = true;
let tokens: string[] = [];
let register: (token: string) => Promise<{ claimToken: string }>;
stub(marketplace, {
	awsMarketplaceConfig: () =>
		configured
			? {
					productCode: "prod-code",
					sellerAccountId: null,
					eventsToken: null,
					enterprisePlanId: "enterprise",
				}
			: null,
	registerAwsMarketplaceCustomer: (token: string) => {
		tokens.push(token);
		return register(token);
	},
});

const { POST } = await import("./route");

function post(fields: Record<string, string>): Request {
	return new Request(
		"https://api.test/api/integrations/aws-marketplace/fulfillment",
		{ method: "POST", body: new URLSearchParams(fields) },
	);
}

beforeEach(() => {
	configured = true;
	tokens = [];
	register = async () => ({ claimToken: "claim-1" });
});

describe("AWS Marketplace fulfillment", () => {
	test("resolves the form token and sends the buyer to the link page", async () => {
		const response = await POST(
			post({ "x-amzn-marketplace-token": "aws-token" }),
		);
		expect(response.status).toBe(303);
		expect(response.headers.get("location")).toBe(
			"https://app.superset.sh/aws-marketplace?claim=claim-1",
		);
		expect(tokens).toEqual(["aws-token"]);
	});

	test("a rejected token reaches the link page as an error", async () => {
		register = async () => {
			throw new marketplace.AwsMarketplaceRegistrationError("expired_token");
		};
		const response = await POST(post({ "x-amzn-marketplace-token": "reused" }));
		expect(response.headers.get("location")).toBe(
			"https://app.superset.sh/aws-marketplace?error=expired_token",
		);
	});

	test("an AWS outage is not shown as a bad token", async () => {
		register = async () => {
			throw new Error("ThrottlingException");
		};
		const response = await POST(post({ "x-amzn-marketplace-token": "t" }));
		expect(response.headers.get("location")).toBe(
			"https://app.superset.sh/aws-marketplace?error=unavailable",
		);
	});

	test("a post without a token never calls AWS", async () => {
		const response = await POST(post({}));
		expect(response.headers.get("location")).toBe(
			"https://app.superset.sh/aws-marketplace?error=invalid_token",
		);
		expect(tokens).toEqual([]);
	});

	test("answers 404 while the integration is not configured", async () => {
		configured = false;
		const response = await POST(post({ "x-amzn-marketplace-token": "t" }));
		expect(response.status).toBe(404);
		expect(tokens).toEqual([]);
	});
});
