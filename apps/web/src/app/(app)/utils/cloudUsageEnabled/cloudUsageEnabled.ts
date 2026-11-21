import { FEATURE_FLAGS } from "@superset/shared/constants";
import { organizationFlagEnabled } from "@superset/trpc/feature-flags";
import { cache } from "react";

import { posthogServer } from "@/lib/posthog-server";
import { requireSession } from "../requireSession";

export const cloudUsageEnabled = cache(async (): Promise<boolean> => {
	const organizationId = (await requireSession()).session.activeOrganizationId;
	return organizationId
		? organizationFlagEnabled(
				posthogServer,
				FEATURE_FLAGS.CLOUD_USAGE,
				organizationId,
			)
		: false;
});
