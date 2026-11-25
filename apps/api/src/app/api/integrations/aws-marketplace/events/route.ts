import {
	AWS_MARKETPLACE_TOKEN_HEADER,
	awsMarketplaceConfig,
	eventsTokenMatches,
	marketplaceEventAction,
	syncAwsMarketplaceLicense,
} from "@superset/auth/billing/aws-marketplace";

export const dynamic = "force-dynamic";

/**
 * Target of the EventBridge API destination for AWS Marketplace events. The
 * connection sends AWS_MARKETPLACE_EVENTS_TOKEN in the token header; a 5xx
 * makes EventBridge retry.
 */
export async function POST(request: Request): Promise<Response> {
	const config = awsMarketplaceConfig();
	if (!config?.eventsToken) {
		return Response.json({ error: "Not found" }, { status: 404 });
	}
	if (
		!eventsTokenMatches(
			config.eventsToken,
			request.headers.get(AWS_MARKETPLACE_TOKEN_HEADER),
		)
	) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const payload: unknown = await request.json().catch(() => null);
	const action = marketplaceEventAction(payload, config);
	if (action.kind === "ignore") {
		return Response.json({ ok: true, ignored: action.reason });
	}
	const outcome = await syncAwsMarketplaceLicense(action.locator, {
		revoke: action.kind === "revoke",
	});
	console.info("[aws-marketplace/events]", action.detailType, outcome);
	return Response.json({ ok: true, outcome });
}
