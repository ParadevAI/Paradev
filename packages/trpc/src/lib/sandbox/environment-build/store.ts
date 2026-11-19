import { db, dbWs } from "@superset/db/client";
import {
	environmentBuilds,
	environmentRepositories,
	environments,
	type SelectEnvironmentBuild,
} from "@superset/db/schema";
import { and, desc, eq, isNotNull, isNull, ne } from "drizzle-orm";

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

export async function activeEnvironments(): Promise<
	Array<{ id: string; organizationId: string }>
> {
	return db
		.select({
			id: environments.id,
			organizationId: environments.organizationId,
		})
		.from(environments)
		.where(isNull(environments.archivedAt));
}

/** False when the build is no longer running. */
export async function markBuildFresh(buildId: string): Promise<boolean> {
	const rows = await db
		.update(environmentBuilds)
		.set({ kind: "fresh" })
		.where(
			and(
				eq(environmentBuilds.id, buildId),
				eq(environmentBuilds.status, "running"),
			),
		)
		.returning({ id: environmentBuilds.id });
	return rows.length > 0;
}
