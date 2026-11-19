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
	isNotNull,
	isNull,
	ne,
	sql,
} from "drizzle-orm";
import { STALE_BUILD_MS } from "./limits";
import { type FreshRebuildClaim, freshRebuildClaim } from "./policy";

type EnvironmentRow = typeof environments.$inferSelect;

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

/**
 * Makes `goldenRef` the golden new workspaces fork, with the repositories it
 * was built with. Guarded on the golden the build started from, so a promote
 * or archive during the build wins and this returns false. A replaced golden
 * no build made (one saved from a workspace) gets a `promote` row, so
 * retention can delete it later.
 */
export async function succeedBuild(args: {
	build: SelectEnvironmentBuild;
	previousSourceRef: string;
	goldenRef: string;
}): Promise<boolean> {
	return dbWs.transaction(async (tx) => {
		const [before] = await tx
			.select({ sourceKind: environments.sourceKind })
			.from(environments)
			.where(eq(environments.id, args.build.environmentId));
		const [row] = await tx
			.update(environments)
			.set({
				sourceKind: "fork",
				sourceRef: args.goldenRef,
				primaryRepositoryId: args.build.primaryRepositoryId,
			})
			.where(
				and(
					eq(environments.id, args.build.environmentId),
					eq(environments.sourceRef, args.previousSourceRef),
					isNull(environments.archivedAt),
				),
			)
			.returning({ id: environments.id });
		if (!row) return false;
		if (before?.sourceKind === "fork") {
			const [recorded] = await tx
				.select({ id: environmentBuilds.id })
				.from(environmentBuilds)
				.where(
					and(
						eq(environmentBuilds.environmentId, args.build.environmentId),
						eq(environmentBuilds.goldenRef, args.previousSourceRef),
					),
				)
				.limit(1);
			if (!recorded) {
				const replacedAt = new Date(args.build.startedAt.getTime() - 1);
				await tx.insert(environmentBuilds).values({
					environmentId: args.build.environmentId,
					organizationId: args.build.organizationId,
					status: "succeeded",
					trigger: "promote",
					kind: "incremental",
					repositoryIds: args.build.repositoryIds,
					primaryRepositoryId: args.build.primaryRepositoryId,
					goldenRef: args.previousSourceRef,
					startedAt: replacedAt,
					finishedAt: replacedAt,
				});
			}
		}
		await tx
			.delete(environmentRepositories)
			.where(
				eq(environmentRepositories.environmentId, args.build.environmentId),
			);
		await tx.insert(environmentRepositories).values(
			args.build.repositoryIds.map((repositoryId) => ({
				environmentId: args.build.environmentId,
				repositoryId,
			})),
		);
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
	limit: number,
): Promise<SelectEnvironmentBuild[]> {
	return db
		.select()
		.from(environmentBuilds)
		.where(
			and(
				eq(environmentBuilds.environmentId, environmentId),
				ne(environmentBuilds.status, "running"),
			),
		)
		.orderBy(desc(environmentBuilds.startedAt))
		.limit(limit);
}

/** Goldens of succeeded builds not deleted yet, newest first. */
export async function undeletedGoldens(
	environmentId: string,
): Promise<Array<{ id: string; goldenRef: string }>> {
	const rows = await db
		.select({
			id: environmentBuilds.id,
			goldenRef: environmentBuilds.goldenRef,
		})
		.from(environmentBuilds)
		.where(
			and(
				eq(environmentBuilds.environmentId, environmentId),
				eq(environmentBuilds.status, "succeeded"),
				isNotNull(environmentBuilds.goldenRef),
				isNull(environmentBuilds.goldenDeletedAt),
			),
		)
		.orderBy(desc(environmentBuilds.startedAt));
	return rows.flatMap((row) =>
		row.goldenRef ? [{ id: row.id, goldenRef: row.goldenRef }] : [],
	);
}

export async function markGoldenDeleted(buildId: string): Promise<void> {
	await db
		.update(environmentBuilds)
		.set({ goldenDeletedAt: new Date() })
		.where(eq(environmentBuilds.id, buildId));
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
 * Makes a running build fresh if the caps allow it. A claimed or waiting
 * build restarts its clock, so the stale rule does not expire it while it
 * waits. The lock makes the count and the update one decision across builds.
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
		if (claim !== "refused") {
			await tx
				.update(environmentBuilds)
				.set({
					startedAt: new Date(now),
					...(claim === "claimed" ? { kind: "fresh" as const } : {}),
				})
				.where(eq(environmentBuilds.id, buildId));
		}
		return claim;
	});
}
