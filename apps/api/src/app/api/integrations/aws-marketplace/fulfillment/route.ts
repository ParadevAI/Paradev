import {
	AwsMarketplaceRegistrationError,
	awsMarketplaceConfig,
	registerAwsMarketplaceCustomer,
} from "@superset/auth/billing/aws-marketplace";
import { env } from "@/env";

export const dynamic = "force-dynamic";

const TOKEN_FIELD = "x-amzn-marketplace-token";

function toLinkPage(params: Record<string, string>): Response {
	const url = new URL("/aws-marketplace", env.NEXT_PUBLIC_WEB_URL);
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}
	return Response.redirect(url, 303);
}

/** The fulfillment URL: AWS Marketplace posts the buyer's browser here after a purchase. */
export async function POST(request: Request): Promise<Response> {
	if (!awsMarketplaceConfig()) {
		return Response.json({ error: "Not found" }, { status: 404 });
	}
	const form = await request.formData().catch(() => null);
	const token = form?.get(TOKEN_FIELD);
	if (typeof token !== "string" || !token) {
		return toLinkPage({ error: "invalid_token" });
	}
	try {
		const { claimToken } = await registerAwsMarketplaceCustomer(token);
		return toLinkPage({ claim: claimToken });
	} catch (error) {
		if (error instanceof AwsMarketplaceRegistrationError) {
			console.warn("[aws-marketplace/fulfillment] rejected", error.reason);
			return toLinkPage({ error: error.reason });
		}
		console.error("[aws-marketplace/fulfillment] registration failed", error);
		return toLinkPage({ error: "unavailable" });
	}
}
