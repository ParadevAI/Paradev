import { describe, expect, test } from "bun:test";
import { eventsTokenMatches, marketplaceEventAction } from "./events";

const expected = { sellerAccountId: "615082100823", productCode: "prod-code" };

function event(detailType: string, detail: Record<string, unknown>) {
	return {
		version: "0",
		id: "event-1",
		"detail-type": detailType,
		source: "aws.agreement-marketplace",
		account: "615082100823",
		region: "us-east-1",
		detail,
	};
}

const license = {
	license: { arn: "arn:license" },
	agreement: { id: "agmt-1" },
	product: { code: "prod-code", id: "prod-vp4a2qbrbqqd6" },
};

describe("marketplaceEventAction", () => {
	test.each([
		"License Updated - Manufacturer",
		"Purchase Agreement Amended - Manufacturer",
		"Purchase Agreement Ended - Manufacturer",
	])("%s re-reads the license's entitlements", (detailType) => {
		expect(
			marketplaceEventAction(event(detailType, license), expected),
		).toEqual({
			kind: "sync",
			locator: { licenseArn: "arn:license" },
			detailType,
		});
	});

	test("License Deprovisioned revokes access", () => {
		expect(
			marketplaceEventAction(
				event("License Deprovisioned - Manufacturer", license),
				expected,
			),
		).toMatchObject({ kind: "revoke", locator: { licenseArn: "arn:license" } });
	});

	test("an agreement event without a license is found by agreement", () => {
		expect(
			marketplaceEventAction(
				event("Purchase Agreement Ended - Manufacturer", {
					agreement: { id: "agmt-1" },
					product: { id: "prod-vp4a2qbrbqqd6" },
				}),
				expected,
			),
		).toMatchObject({ kind: "sync", locator: { agreementId: "agmt-1" } });
	});

	test("Purchase Agreement Created grants nothing before License Updated", () => {
		expect(
			marketplaceEventAction(
				event("Purchase Agreement Created - Manufacturer", license),
				expected,
			).kind,
		).toBe("ignore");
	});

	test("ignores events from another source, seller account or product", () => {
		const updated = event("License Updated - Manufacturer", license);
		expect(
			marketplaceEventAction({ ...updated, source: "aws.other" }, expected)
				.kind,
		).toBe("ignore");
		expect(
			marketplaceEventAction({ ...updated, account: "999999999999" }, expected)
				.kind,
		).toBe("ignore");
		expect(
			marketplaceEventAction(
				event("License Updated - Manufacturer", {
					...license,
					product: { code: "other" },
				}),
				expected,
			).kind,
		).toBe("ignore");
		expect(marketplaceEventAction(null, expected).kind).toBe("ignore");
	});
});

describe("eventsTokenMatches", () => {
	test("accepts only the exact configured token", () => {
		const token = "a".repeat(40);
		expect(eventsTokenMatches(token, token)).toBe(true);
		expect(eventsTokenMatches(token, `${token}x`)).toBe(false);
		expect(eventsTokenMatches(token, "b".repeat(40))).toBe(false);
		expect(eventsTokenMatches(token, null)).toBe(false);
		expect(eventsTokenMatches(null, token)).toBe(false);
	});
});
