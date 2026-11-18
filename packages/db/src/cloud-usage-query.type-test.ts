import { listCloudBoots, queryCloudUsage } from "./cloud-usage-query";

declare const db: Parameters<typeof queryCloudUsage>[0];

const window = { from: new Date(0), to: new Date(1) };

/**
 * Never called: `tsc` checks it, which the test files are excluded from. Each directive fails the
 * typecheck if the limit it names is lifted, because an unused `@ts-expect-error` is an error.
 */
export function customerScopeCannotGroupByMoreOrFilterByProject() {
	queryCloudUsage(
		db,
		{ organizationId: "o" },
		{
			window,
			limit: 1,
			// @ts-expect-error a customer scope groups by user, day or workspace
			groupBy: "organization",
			overagePerGbHour: null,
		},
	);
	listCloudBoots(
		db,
		{ organizationId: "o" },
		{
			window,
			// @ts-expect-error only the fleet functions filter by project
			filters: { project: "p" },
			limit: 1,
			now: window.to,
			overagePerGbHour: null,
		},
	);
}
