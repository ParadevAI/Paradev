import { timingSafeEqual } from "node:crypto";

export const AWS_MARKETPLACE_EVENT_SOURCE = "aws.agreement-marketplace";
export const AWS_MARKETPLACE_TOKEN_HEADER = "x-aws-marketplace-token";

export type LicenseLocator = { licenseArn: string } | { agreementId: string };

export type MarketplaceEventAction =
	| { kind: "sync"; locator: LicenseLocator; detailType: string }
	| { kind: "revoke"; locator: LicenseLocator; detailType: string }
	| { kind: "ignore"; reason: string };

interface EventBridgeEvent {
	source?: unknown;
	account?: unknown;
	"detail-type"?: unknown;
	detail?: {
		license?: { arn?: unknown };
		agreement?: { id?: unknown };
		product?: { code?: unknown };
	};
}

export function eventsTokenMatches(
	expected: string | null,
	received: string | null,
): boolean {
	if (!expected || !received) return false;
	const a = Buffer.from(expected);
	const b = Buffer.from(received);
	return a.length === b.length && timingSafeEqual(a, b);
}

function text(value: unknown): string | null {
	return typeof value === "string" && value ? value : null;
}

/**
 * Turns an EventBridge AWS Marketplace event into the work it asks for. The
 * event only says which license changed; the entitlements themselves are
 * always read back from GetEntitlements.
 *
 * - License Updated: entitlement-updated and subscribe-success.
 * - Purchase Agreement Ended: unsubscribe-pending. Access stays until the
 *   license is deprovisioned, so this only re-reads entitlements.
 * - License Deprovisioned: unsubscribe-success. Access ends.
 * - Purchase Agreement Created: no license yet (a failed subscribe never gets
 *   one), so nothing to grant until License Updated arrives.
 */
export function marketplaceEventAction(
	payload: unknown,
	expected: { sellerAccountId: string | null; productCode: string },
): MarketplaceEventAction {
	const event = (payload ?? {}) as EventBridgeEvent;
	if (event.source !== AWS_MARKETPLACE_EVENT_SOURCE) {
		return { kind: "ignore", reason: "unexpected source" };
	}
	if (expected.sellerAccountId && event.account !== expected.sellerAccountId) {
		return { kind: "ignore", reason: "unexpected account" };
	}
	const productCode = text(event.detail?.product?.code);
	if (productCode && productCode !== expected.productCode) {
		return { kind: "ignore", reason: "other product" };
	}
	const detailType = text(event["detail-type"]) ?? "";
	const licenseArn = text(event.detail?.license?.arn);
	const agreementId = text(event.detail?.agreement?.id);
	const locator: LicenseLocator | null = licenseArn
		? { licenseArn }
		: agreementId
			? { agreementId }
			: null;
	if (!locator) return { kind: "ignore", reason: "no license or agreement" };

	switch (detailType) {
		case "License Updated - Manufacturer":
		case "Purchase Agreement Amended - Manufacturer":
		case "Purchase Agreement Ended - Manufacturer":
		case "Purchase Agreement Free Trial Converted - Manufacturer":
			return { kind: "sync", locator, detailType };
		case "License Deprovisioned - Manufacturer":
			return { kind: "revoke", locator, detailType };
		default:
			return { kind: "ignore", reason: `unhandled ${detailType}` };
	}
}
