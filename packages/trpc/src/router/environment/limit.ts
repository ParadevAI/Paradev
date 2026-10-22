import { db } from "@superset/db/client";
import { environments } from "@superset/db/schema";
import { and, count, eq, isNull } from "drizzle-orm";
import { organizationEnvironmentLimit } from "../../lib/billing/plan";
import { userError } from "../../trpc";

async function countEnvironments(organizationId: string): Promise<number> {
	const [row] = await db
		.select({ used: count() })
		.from(environments)
		.where(
			and(
				eq(environments.organizationId, organizationId),
				isNull(environments.archivedAt),
			),
		);
	return row?.used ?? 0;
}

export function environmentLimitError(limit: number) {
	return userError({
		code: "FORBIDDEN",
		message: `Your organization has reached its environment limit (${limit}). Archive an environment, or upgrade in Settings, Billing to add more.`,
		i18nKey: "serverError.environment.limitReached",
		params: { limit },
	});
}

/** Throws when one more environment would pass the org's limit. */
export function assertBelowEnvironmentLimit(used: number, limit: number): void {
	if (used >= limit) throw environmentLimitError(limit);
}

export async function assertEnvironmentCapacity(
	organizationId: string,
): Promise<void> {
	const [used, limit] = await Promise.all([
		countEnvironments(organizationId),
		organizationEnvironmentLimit(organizationId),
	]);
	assertBelowEnvironmentLimit(used, limit);
}
