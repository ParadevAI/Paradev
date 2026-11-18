import type { CloudFleetScope } from "./cloud-usage-query";

/** Staff only: only the admin app imports this file, and cloud-usage-fleet.test.ts keeps every other package from it. */
export function cloudFleetScope(organizationId?: string): CloudFleetScope {
	return { organizationId } as CloudFleetScope;
}
