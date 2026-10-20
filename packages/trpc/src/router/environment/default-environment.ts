import { dbWs } from "@superset/db/client";
import {
	environmentRepositories,
	environments,
	githubRepositories,
} from "@superset/db/schema";
import { SANDBOX_IMAGE_NAME } from "@superset/shared/constants";
import type { SandboxRegionId } from "@superset/shared/sandbox-regions";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { userError } from "../../trpc";
import { currentBundleSha } from "./current-bundle";

interface CarryingEnvironment {
	id: string;
	repositoryCount: number;
	hooksRepositoryId: string | null;
}

/**
 * Among the environments that check out a repository, oldest first: the first
 * that opens on it, meaning it checks out only that repository or names it as
 * its config location. One that opens on another repository is never reused;
 * the workspace would start, and file, somewhere else.
 */
export function pickDefaultEnvironment<T extends CarryingEnvironment>(
	carrying: readonly T[],
	repositoryId: string,
): T | undefined {
	return carrying.find(
		(row) =>
			row.hooksRepositoryId === repositoryId ||
			(row.repositoryCount === 1 && row.hooksRepositoryId === null),
	);
}

/**
 * The environment a cloud workspace on one repository starts from when the
 * caller names none. An existing one the caller can use wins; otherwise a new
 * one named after the repository, shared with the organization, opening on
 * that repository, in `region`.
 */
export async function ensureDefaultEnvironment(args: {
	organizationId: string;
	repositoryId: string;
	userId: string;
	region: SandboxRegionId;
}): Promise<{ id: string; created: boolean }> {
	// One transaction under an advisory lock per (organization, repository):
	// two first workspaces at once share one environment, and an environment
	// never exists without its repository link.
	return dbWs.transaction(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtext(${`${args.organizationId}:${args.repositoryId}`}))`,
		);
		const carrying = await tx
			.select({
				id: environments.id,
				hooksRepositoryId: environments.hooksRepositoryId,
				repositoryCount: sql<number>`(
					select count(*)::int from ${environmentRepositories}
					where ${environmentRepositories.environmentId} = ${environments.id}
				)`,
			})
			.from(environments)
			.innerJoin(
				environmentRepositories,
				eq(environmentRepositories.environmentId, environments.id),
			)
			.where(
				and(
					eq(environments.organizationId, args.organizationId),
					isNull(environments.archivedAt),
					eq(environmentRepositories.repositoryId, args.repositoryId),
					or(
						eq(environments.scope, "organization"),
						eq(environments.createdByUserId, args.userId),
					),
				),
			)
			.orderBy(asc(environments.createdAt));
		const existing = pickDefaultEnvironment(carrying, args.repositoryId);
		if (existing) return { id: existing.id, created: false };

		const [repository] = await tx
			.select({ id: githubRepositories.id, name: githubRepositories.name })
			.from(githubRepositories)
			.where(
				and(
					eq(githubRepositories.id, args.repositoryId),
					eq(githubRepositories.organizationId, args.organizationId),
				),
			)
			.limit(1);
		if (!repository) {
			throw userError({
				code: "NOT_FOUND",
				message: "The repository is not connected to this organization",
				i18nKey: "serverError.environment.repositoryNotConnected",
			});
		}
		const [row] = await tx
			.insert(environments)
			.values({
				organizationId: args.organizationId,
				name: repository.name,
				provider: "vercel",
				sourceKind: "image",
				sourceRef: SANDBOX_IMAGE_NAME,
				region: args.region,
				bundleSha: await currentBundleSha(),
				scope: "organization",
				hooksRepositoryId: repository.id,
				createdByUserId: args.userId,
			})
			.returning({ id: environments.id });
		if (!row) {
			throw userError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Could not record environment",
				i18nKey: "serverError.environment.couldNotRecord",
			});
		}
		await tx.insert(environmentRepositories).values({
			environmentId: row.id,
			repositoryId: repository.id,
		});
		return { id: row.id, created: true };
	});
}
