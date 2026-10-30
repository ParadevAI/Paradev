import { db, dbWs } from "@superset/db/client";
import {
	environmentBuilds,
	environmentRepositories,
	environments,
	type SelectEnvironmentBuild,
} from "@superset/db/schema";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";

type EnvironmentRow = typeof environments.$inferSelect;

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
			const [swapped] = await tx
				.update(environments)
				.set({
					sourceKind: "fork",
					sourceRef: goldenRef,
					primaryRepositoryId: build.primaryRepositoryId,
				})
				.where(
					and(
						eq(environments.id, build.environmentId),
						eq(environments.sourceRef, previousSourceRef),
						isNull(environments.archivedAt),
					),
				)
				.returning({ id: environments.id });
			if (!swapped) return false;
			// The golden baked these checkouts; a fork must ask for the same.
			await tx
				.delete(environmentRepositories)
				.where(eq(environmentRepositories.environmentId, build.environmentId));
			await tx.insert(environmentRepositories).values(
				build.repositoryIds.map((repositoryId) => ({
					environmentId: build.environmentId,
					repositoryId,
				})),
			);
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
