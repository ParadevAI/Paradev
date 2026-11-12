import { analyticsConsentResponse } from "@superset/shared/analytics-consent";
import { COMPANY } from "@superset/shared/constants";
import { env } from "@/env";
import { ANALYTICS_CONSENT_KEY } from "@/lib/constants";

export const dynamic = "force-dynamic";

export function GET() {
	return analyticsConsentResponse({
		consentKey: ANALYTICS_CONSENT_KEY,
		posthogKey: env.NEXT_PUBLIC_POSTHOG_KEY,
		docsOrigin: new URL(COMPANY.DOCS_URL).origin,
	});
}
