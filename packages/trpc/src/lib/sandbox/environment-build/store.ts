import { db, dbWs } from "@superset/db/client";
import {
	environmentBuilds,
	environmentRepositories,
	environments,
	type SelectEnvironmentBuild,
} from "@superset/db/schema";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";

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
