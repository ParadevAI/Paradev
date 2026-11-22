import { db, type dbWs } from "@superset/db/client";
import { environments } from "@superset/db/schema";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { organizationEnvironmentLimit } from "../../lib/billing/plan";
import { userError } from "../../trpc";

type Transaction = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

export async function countEnvironments(
	organizationId: string,
	executor: typeof db | Transaction = db,
): Promise<number> {
	const [row] = await executor
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
	if (limit === 0) {
		return userError({
			code: "FORBIDDEN",
			message:
				"Your plan does not include cloud environments. Upgrade in Settings, Billing to create one.",
			i18nKey: "serverError.environment.notIncluded",
		});
	}
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

/** Checks the org's limit and returns it, for the locked recount at insert. */
export async function assertEnvironmentCapacity(
	organizationId: string,
): Promise<number> {
	const [used, limit] = await Promise.all([
		countEnvironments(organizationId),
		organizationEnvironmentLimit(organizationId),
	]);
	assertBelowEnvironmentLimit(used, limit);
	return limit;
}

/** Recounts under a per-org lock so two concurrent creates cannot both pass. */
export async function assertEnvironmentCapacityLocked(
	tx: Transaction,
	organizationId: string,
	limit: number,
): Promise<void> {
	if (limit === Number.POSITIVE_INFINITY) return;
	await tx.execute(
		sql`select pg_advisory_xact_lock(hashtext(${`environments:${organizationId}`}))`,
	);
	assertBelowEnvironmentLimit(
		await countEnvironments(organizationId, tx),
		limit,
	);
}
