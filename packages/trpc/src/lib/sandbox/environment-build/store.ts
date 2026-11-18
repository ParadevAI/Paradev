import { db, dbWs } from "@superset/db/client";
import {
	cloudWorkspaces,
	environmentBuilds,
	environmentRepositories,
	environments,
	type SelectEnvironmentBuild,
} from "@superset/db/schema";
import {
	and,
	count,
	desc,
	eq,
	gt,
	inArray,
	isNull,
	ne,
	sql,
} from "drizzle-orm";
import {
	type FreshRebuildClaim,
	freshRebuildClaim,
	STALE_BUILD_MS,
} from "./policy";

type EnvironmentRow = typeof environments.$inferSelect;
type Transaction = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

/**
 * Makes `goldenRef` the golden new workspaces fork, with the repositories it
 * was built with. Guarded on the golden read before, so a concurrent promote,
 * build or restore wins and this returns null.
 */
export async function activateGolden(
	tx: Transaction,
	args: {
		environmentId: string;
		previousSourceRef: string;
		goldenRef: string;
		repositoryIds: readonly string[];
		primaryRepositoryId: string | null;
	},
): Promise<EnvironmentRow | null> {
	const [row] = await tx
		.update(environments)
		.set({
			sourceKind: "fork",
			sourceRef: args.goldenRef,
			primaryRepositoryId: args.primaryRepositoryId,
		})
		.where(
			and(
				eq(environments.id, args.environmentId),
				eq(environments.sourceRef, args.previousSourceRef),
				isNull(environments.archivedAt),
			),
		)
		.returning();
	if (!row) return null;
	await tx
		.delete(environmentRepositories)
		.where(eq(environmentRepositories.environmentId, args.environmentId));
	await tx.insert(environmentRepositories).values(
		args.repositoryIds.map((repositoryId) => ({
			environmentId: args.environmentId,
			repositoryId,
		})),
	);
	return row;
}

export async function loadBuild(buildId: string): Promise<{
	build: SelectEnvironmentBuild;
	environment: EnvironmentRow;
} | null> {
	const [row] = await db
		.select({ build: environmentBuilds, environment: environments })
		.from(environmentBuilds)
		.innerJoin(
			environments,
			eq(environmentBuilds.environmentId, environments.id),
		)
		.where(eq(environmentBuilds.id, buildId));
	return row ?? null;
}

export async function recordBuildCommit(
	buildId: string,
	commitSha: string,
): Promise<void> {
	await db
		.update(environmentBuilds)
		.set({ commitSha })
		.where(eq(environmentBuilds.id, buildId));
}

/** False when the build is no longer running, so the workflow stops. */
export async function recordBuildLog(
	buildId: string,
	log: string,
): Promise<boolean> {
	const rows = await db
		.update(environmentBuilds)
		.set({ log })
		.where(
			and(
				eq(environmentBuilds.id, buildId),
				eq(environmentBuilds.status, "running"),
			),
		)
		.returning({ id: environmentBuilds.id });
	return rows.length > 0;
}

export async function failBuild(buildId: string, error: string): Promise<void> {
	await db
		.update(environmentBuilds)
		.set({ status: "failed", error, finishedAt: new Date() })
		.where(
			and(
				eq(environmentBuilds.id, buildId),
				eq(environmentBuilds.status, "running"),
			),
		);
}

/** False when the environment moved to another golden during the build. */
export async function succeedBuild(args: {
	build: SelectEnvironmentBuild;
	previousSourceRef: string;
	goldenRef: string;
}): Promise<boolean> {
	return dbWs.transaction(async (tx) => {
		const activated = await activateGolden(tx, {
			environmentId: args.build.environmentId,
			previousSourceRef: args.previousSourceRef,
			goldenRef: args.goldenRef,
			repositoryIds: args.build.repositoryIds,
			primaryRepositoryId: args.build.primaryRepositoryId,
		});
		if (!activated) return false;
		await tx
			.update(environmentBuilds)
			.set({
				status: "succeeded",
				goldenRef: args.goldenRef,
				finishedAt: new Date(),
			})
			.where(eq(environmentBuilds.id, args.build.id));
		return true;
	});
}

/** Finished builds, newest first. */
export async function finishedBuilds(
	environmentId: string,
	limit?: number,
): Promise<SelectEnvironmentBuild[]> {
	const query = db
		.select()
		.from(environmentBuilds)
		.where(
			and(
				eq(environmentBuilds.environmentId, environmentId),
				ne(environmentBuilds.status, "running"),
			),
		)
		.orderBy(desc(environmentBuilds.startedAt));
	return limit ? query.limit(limit) : query;
}

export async function markGoldensDeleted(
	buildIds: readonly string[],
): Promise<void> {
	if (buildIds.length === 0) return;
	await db
		.update(environmentBuilds)
		.set({ goldenDeletedAt: new Date() })
		.where(inArray(environmentBuilds.id, [...buildIds]));
}

const BUSY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Busiest first: most cloud workspaces created in the last week. */
export async function activeEnvironments(): Promise<
	Array<{ id: string; organizationId: string }>
> {
	const recent = db
		.select({
			environmentId: cloudWorkspaces.environmentId,
			workspaces: count().as("workspaces"),
		})
		.from(cloudWorkspaces)
		.where(gt(cloudWorkspaces.createdAt, new Date(Date.now() - BUSY_WINDOW_MS)))
		.groupBy(cloudWorkspaces.environmentId)
		.as("recent");
	return db
		.select({
			id: environments.id,
			organizationId: environments.organizationId,
		})
		.from(environments)
		.leftJoin(recent, eq(recent.environmentId, environments.id))
		.where(isNull(environments.archivedAt))
		.orderBy(desc(sql`coalesce(${recent.workspaces}, 0)`), environments.id);
}

/**
 * Makes a running build fresh if the caps allow it, and restarts its clock.
 * The lock makes the count and the update one decision across builds.
 */
export async function claimFreshRebuild(
	buildId: string,
): Promise<FreshRebuildClaim | null> {
	return dbWs.transaction(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtext('environment_builds.fresh_rebuild'))`,
		);
		const [build] = await tx
			.select()
			.from(environmentBuilds)
			.where(eq(environmentBuilds.id, buildId));
		if (!build || build.status !== "running") return null;
		if (build.kind === "fresh") return "claimed";
		const now = Date.now();
		const [counts] = await tx
			.select({
				running: count(
					sql`case when ${environmentBuilds.status} = 'running' and ${environmentBuilds.startedAt} > ${new Date(now - STALE_BUILD_MS)} then 1 end`,
				),
				startedLastHour: count(),
			})
			.from(environmentBuilds)
			.where(
				and(
					eq(environmentBuilds.kind, "fresh"),
					gt(environmentBuilds.startedAt, new Date(now - 60 * 60 * 1000)),
				),
			);
		const claim = freshRebuildClaim({
			running: counts?.running ?? 0,
			startedLastHour: counts?.startedLastHour ?? 0,
			trigger: build.trigger,
		});
		if (claim === "claimed") {
			await tx
				.update(environmentBuilds)
				.set({ kind: "fresh", startedAt: new Date(now) })
				.where(eq(environmentBuilds.id, buildId));
		}
		return claim;
	});
}

/** Restarts the clock of a build that waited for a fresh slot it did not get. */
export async function restartBuildClock(buildId: string): Promise<void> {
	await db
		.update(environmentBuilds)
		.set({ startedAt: new Date() })
		.where(
			and(
				eq(environmentBuilds.id, buildId),
				eq(environmentBuilds.status, "running"),
			),
		);
}
