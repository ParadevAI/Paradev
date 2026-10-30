import { db } from "@superset/db/client";
import { environmentBuilds, environments } from "@superset/db/schema";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { DAILY_PAUSE_AFTER_FAILURES, dailyBuildsPaused } from "./policy";
import {
	type BuildRefusalReason,
	BuildRefused,
	organizationMayBuild,
	startEnvironmentBuild,
} from "./start";

export interface DailyBuildDeps {
	environments(): Promise<Array<{ id: string; organizationId: string }>>;
	recentFinished(
		environmentId: string,
	): Promise<Array<{ status: "running" | "succeeded" | "failed" }>>;
	mayBuild(organizationId: string): Promise<boolean>;
	start(environmentId: string): Promise<unknown>;
}

const defaultDeps: DailyBuildDeps = {
	environments: () =>
		db
			.select({
				id: environments.id,
				organizationId: environments.organizationId,
			})
			.from(environments)
			.where(isNull(environments.archivedAt)),
	recentFinished: (environmentId) =>
		db
			.select({ status: environmentBuilds.status })
			.from(environmentBuilds)
			.where(
				and(
					eq(environmentBuilds.environmentId, environmentId),
					ne(environmentBuilds.status, "running"),
				),
			)
			.orderBy(desc(environmentBuilds.startedAt))
			.limit(DAILY_PAUSE_AFTER_FAILURES),
	mayBuild: organizationMayBuild,
	start: (environmentId) =>
		startEnvironmentBuild({ environmentId, trigger: "daily" }),
};

export interface DailyBuildOutcome {
	queued: number;
	skipped: Partial<Record<BuildRefusalReason | "paused", number>>;
	failed: number;
}

/**
 * Starts a build of every environment that can have one: not archived, on a
 * paid plan, with `[install]`, and not paused by three failures in a row. No
 * change check: an unchanged environment is built too.
 */
export async function queueDailyBuilds(
	deps: DailyBuildDeps = defaultDeps,
): Promise<DailyBuildOutcome> {
	const outcome: DailyBuildOutcome = { queued: 0, skipped: {}, failed: 0 };
	const skip = (reason: keyof DailyBuildOutcome["skipped"]) => {
		outcome.skipped[reason] = (outcome.skipped[reason] ?? 0) + 1;
	};
	const paid = new Map<string, boolean>();
	for (const environment of await deps.environments()) {
		let mayBuild = paid.get(environment.organizationId);
		if (mayBuild === undefined) {
			mayBuild = await deps.mayBuild(environment.organizationId);
			paid.set(environment.organizationId, mayBuild);
		}
		if (!mayBuild) {
			skip("not-paid");
			continue;
		}
		if (dailyBuildsPaused(await deps.recentFinished(environment.id))) {
			skip("paused");
			continue;
		}
		try {
			await deps.start(environment.id);
			outcome.queued++;
		} catch (error) {
			if (error instanceof BuildRefused) {
				skip(error.reason);
				continue;
			}
			outcome.failed++;
			console.error(
				`[environment-build] daily build of ${environment.id} could not start`,
				error,
			);
		}
	}
	return outcome;
}
