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

export interface BuildStore {
	load(buildId: string): Promise<{
		build: SelectEnvironmentBuild;
		environment: EnvironmentRow;
	} | null>;
	recordCommit(buildId: string, commitSha: string): Promise<void>;
	fail(buildId: string, error: string): Promise<void>;
	/** False when the environment moved to another golden during the build. */
	succeed(args: {
		build: SelectEnvironmentBuild;
		previousSourceRef: string;
		goldenRef: string;
	}): Promise<boolean>;
	builds(environmentId: string): Promise<SelectEnvironmentBuild[]>;
	markGoldensDeleted(buildIds: readonly string[]): Promise<void>;
}

export const buildStore: BuildStore = {
	async load(buildId) {
		const [row] = await db
			.select({ build: environmentBuilds, environment: environments })
			.from(environmentBuilds)
			.innerJoin(
				environments,
				eq(environmentBuilds.environmentId, environments.id),
			)
			.where(eq(environmentBuilds.id, buildId));
		return row ?? null;
	},

	async recordCommit(buildId, commitSha) {
		await db
			.update(environmentBuilds)
			.set({ commitSha })
			.where(eq(environmentBuilds.id, buildId));
	},

	async fail(buildId, error) {
		await db
			.update(environmentBuilds)
			.set({ status: "failed", error, finishedAt: new Date() })
			.where(
				and(
					eq(environmentBuilds.id, buildId),
					eq(environmentBuilds.status, "running"),
				),
			);
	},

	async succeed({ build, previousSourceRef, goldenRef }) {
		return dbWs.transaction(async (tx) => {
			const activated = await activateGolden(tx, {
				environmentId: build.environmentId,
				previousSourceRef,
				goldenRef,
				repositoryIds: build.repositoryIds,
				primaryRepositoryId: build.primaryRepositoryId,
			});
			if (!activated) return false;
			await tx
				.update(environmentBuilds)
				.set({ status: "succeeded", goldenRef, finishedAt: new Date() })
				.where(eq(environmentBuilds.id, build.id));
			return true;
		});
	},

	async builds(environmentId) {
		return db
			.select()
			.from(environmentBuilds)
			.where(
				and(
					eq(environmentBuilds.environmentId, environmentId),
					ne(environmentBuilds.status, "running"),
				),
			)
			.orderBy(desc(environmentBuilds.startedAt));
	},

	async markGoldensDeleted(buildIds) {
		if (buildIds.length === 0) return;
		await db
			.update(environmentBuilds)
			.set({ goldenDeletedAt: new Date() })
			.where(inArray(environmentBuilds.id, [...buildIds]));
	},
};
