import { db, dbWs } from "@superset/db/client";
import {
	environmentRepositories,
	environmentScopeValues,
	environmentSecrets,
	environments,
	githubRepositories,
} from "@superset/db/schema";
import { SANDBOX_IMAGE_NAME } from "@superset/shared/constants";
import { SANDBOX_REGION_IDS } from "@superset/shared/sandbox-regions";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { assertCloudAccess, assertMember } from "../../lib/cloud-guards";
import {
	buildSandboxClaim,
	deleteSandbox,
	loadRepositories,
	primaryRepository,
	promoteSandboxToEnvironment,
	RepositoryError,
	sortRepositories,
	workspaceRepositories,
} from "../../lib/sandbox";
import { jwtProcedure, userError } from "../../trpc";
import { loadVisibleWorkspace } from "../cloud-workspace/access";
import { currentBundleSha } from "./current-bundle";
import {
	assertEnvironmentCapacity,
	assertEnvironmentCapacityLocked,
} from "./limit";
import { regionForRequest } from "./region-for-request";
import { secretsRouter } from "./secrets";
import { decryptSecret, encryptSecret } from "./secrets/utils/crypto";

/** An environment the caller may see; another member's personal one does not exist to them. */
export async function loadEnvironment(
	id: string,
	ctx: { organizationIds: string[]; userId: string },
) {
	const row = await db.query.environments.findFirst({
		where: and(eq(environments.id, id), isNull(environments.archivedAt)),
	});
	const visible =
		row &&
		ctx.organizationIds.includes(row.organizationId) &&
		(row.scope !== "personal" || row.createdByUserId === ctx.userId);
	if (!visible) {
		throw userError({
			code: "NOT_FOUND",
			message: "Environment not found",
			i18nKey: "serverError.environment.environmentNotFound",
		});
	}
	return row;
}

/**
 * Who a personal environment belongs to: only its owner can see it, so a row
 * nobody created (the release's) becomes the caller's, and another person's
 * cannot be taken.
 */
function personalOwner(
	row: { createdByUserId: string | null },
	userId: string,
): string {
	if (row.createdByUserId && row.createdByUserId !== userId) {
		throw userError({
			code: "FORBIDDEN",
			message:
				"Only the person who created this environment can make it personal",
			i18nKey: "serverError.environment.personalNotCreator",
		});
	}
	return userId;
}

/** The repositories of many environments at once, the primary first then by name. */
async function repositoriesByEnvironment(
	environmentRows: ReadonlyArray<{
		id: string;
		primaryRepositoryId: string | null;
	}>,
) {
	const environmentIds = environmentRows.map((row) => row.id);
	const primaryById = new Map(
		environmentRows.map((row) => [row.id, row.primaryRepositoryId]),
	);
	const rows = environmentIds.length
		? await db
				.select({
					environmentId: environmentRepositories.environmentId,
					id: githubRepositories.id,
					fullName: githubRepositories.fullName,
					owner: githubRepositories.owner,
					name: githubRepositories.name,
					defaultBranch: githubRepositories.defaultBranch,
				})
				.from(environmentRepositories)
				.innerJoin(
					githubRepositories,
					eq(environmentRepositories.repositoryId, githubRepositories.id),
				)
				.where(inArray(environmentRepositories.environmentId, environmentIds))
		: [];
	const map = new Map<
		string,
		Array<Omit<(typeof rows)[number], "environmentId">>
	>();
	for (const { environmentId, ...repo } of rows) {
		map.set(environmentId, [...(map.get(environmentId) ?? []), repo]);
	}
	for (const [environmentId, repos] of map) {
		const primary = primaryRepository(repos, primaryById.get(environmentId));
		map.set(environmentId, [
			...(primary ? [primary] : []),
			...sortRepositories(repos).filter((repo) => repo.id !== primary?.id),
		]);
	}
	return map;
}

async function setEnvironmentRepositories(args: {
	environmentId: string;
	organizationId: string;
	repositoryIds: readonly string[];
	primaryRepositoryId: string;
}): Promise<void> {
	let repositories: Awaited<ReturnType<typeof loadRepositories>>;
	try {
		repositories = await loadRepositories({
			organizationId: args.organizationId,
			repositoryIds: args.repositoryIds,
		});
	} catch (error) {
		if (!(error instanceof RepositoryError)) throw error;
		throw userError({
			code: "BAD_REQUEST",
			message: error.message,
			i18nKey: "serverError.environment.repositoryNotConnected",
		});
	}
	if (!repositories.some((repo) => repo.id === args.primaryRepositoryId)) {
		throw primaryNotIncluded();
	}
	await db
		.delete(environmentRepositories)
		.where(eq(environmentRepositories.environmentId, args.environmentId));
	if (repositories.length) {
		await db.insert(environmentRepositories).values(
			repositories.map((repo) => ({
				environmentId: args.environmentId,
				repositoryId: repo.id,
			})),
		);
	}
	await db
		.update(environments)
		.set({ primaryRepositoryId: args.primaryRepositoryId })
		.where(eq(environments.id, args.environmentId));
}

function primaryNotIncluded() {
	return userError({
		code: "BAD_REQUEST",
		message:
			"The primary repository must be one of the environment's repositories",
		i18nKey: "serverError.environment.primaryRepositoryNotIncluded",
	});
}

async function loadPromotable(
	ctx: Parameters<typeof loadVisibleWorkspace>[0],
	cloudWorkspaceId: string,
) {
	const workspace = await loadVisibleWorkspace(ctx, cloudWorkspaceId);
	if (workspace.status !== "ready") {
		throw userError({
			code: "PRECONDITION_FAILED",
			message: "Only a ready workspace can become an environment",
			i18nKey: "serverError.environment.workspaceNotReady",
		});
	}
	const source = await db.query.environments.findFirst({
		where: eq(environments.id, workspace.environmentId),
	});
	const checkouts = await workspaceRepositories({
		cloudWorkspaceId: workspace.id,
		primaryRepositoryId: source?.primaryRepositoryId ?? null,
		primaryBranch: workspace.baseBranch,
		workingBranch: workspace.branch,
	});
	return { workspace, source, checkouts };
}

export const environmentRouter = {
	secrets: secretsRouter,

	suggestRegion: jwtProcedure.query(({ ctx }) => ({
		region: regionForRequest(ctx.headers),
	})),

	list: jwtProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			assertMember(ctx.organizationIds, input.organizationId);
			await assertCloudAccess(ctx, input.organizationId);
			const rows = await db
				.select()
				.from(environments)
				.where(
					and(
						eq(environments.organizationId, input.organizationId),
						isNull(environments.archivedAt),
						// A personal environment is its creator's alone.
						or(
							eq(environments.scope, "organization"),
							eq(environments.createdByUserId, ctx.userId),
						),
					),
				)
				.orderBy(asc(environments.name));
			const repos = await repositoriesByEnvironment(rows);
			return rows.map((row) => ({
				...row,
				repositories: repos.get(row.id) ?? [],
			}));
		}),

	get: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const row = await loadEnvironment(input.id, ctx);
			await assertCloudAccess(ctx, row.organizationId);
			const repos = await repositoriesByEnvironment([row]);
			return { ...row, repositories: repos.get(row.id) ?? [] };
		}),

	create: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				name: z.string().min(1).max(100),
				repositoryIds: z.array(z.string().uuid()).min(1).max(20),
				/** The repository a workspace opens on; its `.superset` config runs. */
				primaryRepositoryId: z.string().uuid(),
				scope: z.enum(environmentScopeValues).default("organization"),
				/** Where its boxes run; the region nearest the caller when omitted. */
				region: z.enum(SANDBOX_REGION_IDS).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertMember(ctx.organizationIds, input.organizationId);
			await assertCloudAccess(ctx, input.organizationId);
			const limit = await assertEnvironmentCapacity(input.organizationId);
			if (!input.repositoryIds.includes(input.primaryRepositoryId)) {
				throw primaryNotIncluded();
			}
			const [row] = await dbWs.transaction(async (tx) => {
				await assertEnvironmentCapacityLocked(tx, input.organizationId, limit);
				const bundleSha = await currentBundleSha();
				return tx
					.insert(environments)
					.values({
						organizationId: input.organizationId,
						name: input.name,
						provider: "vercel",
						sourceKind: "image",
						sourceRef: SANDBOX_IMAGE_NAME,
						region: input.region ?? regionForRequest(ctx.headers),
						bundleSha,
						scope: input.scope,
						createdByUserId: ctx.userId,
					})
					.returning();
			});
			if (!row) {
				throw userError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Could not record environment",
					i18nKey: "serverError.environment.couldNotRecord",
				});
			}
			try {
				await setEnvironmentRepositories({
					environmentId: row.id,
					organizationId: input.organizationId,
					repositoryIds: input.repositoryIds,
					primaryRepositoryId: input.primaryRepositoryId,
				});
			} catch (error) {
				await db.delete(environments).where(eq(environments.id, row.id));
				throw error;
			}
			return { ...row, primaryRepositoryId: input.primaryRepositoryId };
		}),

	/** What promoting this workspace would make, before its golden is built. */
	promotePreview: jwtProcedure
		.input(z.object({ cloudWorkspaceId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const { workspace, source, checkouts } = await loadPromotable(
				ctx,
				input.cloudWorkspaceId,
			);
			return {
				name: workspace.name,
				repositories: checkouts.map((entry, index) => ({
					id: entry.repository.id,
					fullName: entry.repository.fullName,
					primary: index === 0,
				})),
				region: source?.region ?? null,
				scope: source?.scope ?? "organization",
			};
		}),

	promote: jwtProcedure
		.input(
			z
				.object({
					cloudWorkspaceId: z.string().uuid(),
					/** Save as a new environment by this name. */
					name: z.string().min(1).max(100).optional(),
					/** Or rebuild this one from the workspace, keeping its id, name and secrets. */
					environmentId: z.string().uuid().optional(),
					scope: z.enum(environmentScopeValues).optional(),
				})
				.refine(
					(input) => Boolean(input.name) !== Boolean(input.environmentId),
					{
						message: "Pass either a name or an environmentId",
					},
				),
		)
		.mutation(async ({ ctx, input }) => {
			const { workspace, source, checkouts } = await loadPromotable(
				ctx,
				input.cloudWorkspaceId,
			);
			const target = input.environmentId
				? await loadEnvironment(input.environmentId, ctx)
				: null;
			if (target) {
				if (target.organizationId !== workspace.organizationId) {
					throw userError({
						code: "BAD_REQUEST",
						message:
							"The workspace and the environment are in different organizations",
						i18nKey: "serverError.environment.organizationMismatch",
					});
				}
			}
			const targetOwner =
				target && input.scope === "personal"
					? personalOwner(target, ctx.userId)
					: null;

			const environmentId = target?.id ?? crypto.randomUUID();
			// The row keeps forking from the old golden until the update lands, so the new one needs its own name.
			const goldenName = `env-${(target ? crypto.randomUUID() : environmentId).replaceAll("-", "").slice(0, 24)}`;
			const inheritedSecrets =
				target || !source
					? []
					: await db
							.select()
							.from(environmentSecrets)
							.where(
								and(
									eq(environmentSecrets.environmentId, source.id),
									eq(
										environmentSecrets.organizationId,
										workspace.organizationId,
									),
								),
							);

			const limit = target
				? null
				: await assertEnvironmentCapacity(workspace.organizationId);
			const { claim } = await buildSandboxClaim({ row: workspace });
			const golden = await promoteSandboxToEnvironment({
				sourceSandbox: workspace.providerSandboxId,
				goldenName,
				claim,
			});
			const primaryRepositoryId = checkouts[0]?.repository.id ?? null;
			const fromGolden = {
				provider: workspace.provider,
				sourceKind: "fork" as const,
				sourceRef: goldenName,
				region: golden.region,
				bundleSha: await currentBundleSha(),
				primaryRepositoryId,
			};
			const row = await dbWs
				.transaction(async (tx) => {
					if (limit !== null) {
						await assertEnvironmentCapacityLocked(
							tx,
							workspace.organizationId,
							limit,
						);
					}
					const [saved] = target
						? await tx
								.update(environments)
								.set({
									...fromGolden,
									...(input.scope ? { scope: input.scope } : {}),
									...(targetOwner ? { createdByUserId: targetOwner } : {}),
								})
								.where(
									and(
										eq(environments.id, target.id),
										isNull(environments.archivedAt),
										eq(environments.sourceRef, target.sourceRef),
										eq(environments.scope, target.scope),
										target.createdByUserId
											? eq(environments.createdByUserId, target.createdByUserId)
											: isNull(environments.createdByUserId),
									),
								)
								.returning()
						: await tx
								.insert(environments)
								.values({
									id: environmentId,
									organizationId: workspace.organizationId,
									name: input.name as string,
									...fromGolden,
									scope: input.scope ?? source?.scope ?? "organization",
									createdByUserId: ctx.userId,
								})
								.returning();
					// The golden baked these checkouts; a fork must ask for the same.
					await tx
						.delete(environmentRepositories)
						.where(eq(environmentRepositories.environmentId, environmentId));
					await tx.insert(environmentRepositories).values(
						checkouts.map((entry) => ({
							environmentId,
							repositoryId: entry.repository.id,
						})),
					);
					if (source && inheritedSecrets.length) {
						await tx.insert(environmentSecrets).values(
							inheritedSecrets.map((secret) => ({
								organizationId: secret.organizationId,
								environmentId,
								key: secret.key,
								encryptedValue: encryptSecret(
									decryptSecret(secret.encryptedValue, {
										environmentId: source.id,
										organizationId: secret.organizationId,
										key: secret.key,
									}),
									{
										environmentId,
										organizationId: secret.organizationId,
										key: secret.key,
									},
								),
								sensitive: secret.sensitive,
								createdByUserId: secret.createdByUserId,
							})),
						);
					}
					if (!saved) {
						throw userError({
							code: "CONFLICT",
							message:
								"The environment changed while this workspace was being saved; run it again",
							i18nKey: "serverError.environment.changedDuringPromote",
						});
					}
					return saved;
				})
				.catch(async (error: unknown) => {
					await deleteSandbox(goldenName).catch((cleanup: unknown) =>
						console.error(
							`[environment/promote] could not delete unused golden ${goldenName}`,
							cleanup,
						),
					);
					throw error;
				});
			if (target?.sourceKind === "fork") {
				await deleteSandbox(target.sourceRef).catch((error: unknown) =>
					console.error(
						`[environment/promote] ${target.id} replaced; could not delete its previous golden ${target.sourceRef}`,
						error,
					),
				);
			}
			return row;
		}),

	update: jwtProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().min(1).max(100).optional(),
				repositoryIds: z.array(z.string().uuid()).min(1).max(20).optional(),
				primaryRepositoryId: z.string().uuid().optional(),
				scope: z.enum(environmentScopeValues).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const current = await loadEnvironment(input.id, ctx);
			await assertCloudAccess(ctx, current.organizationId);

			// A golden was built for its repositories and set up by its primary.
			// Changing either means a different golden, so it is promoted again.
			const changesPrimary =
				input.primaryRepositoryId !== undefined &&
				input.primaryRepositoryId !== current.primaryRepositoryId;
			if (
				(input.repositoryIds || changesPrimary) &&
				current.sourceKind !== "image"
			) {
				throw userError({
					code: "FORBIDDEN",
					message:
						"This environment's repositories are fixed; promote a workspace again to change them",
					i18nKey: "serverError.environment.repositoriesFrozen",
				});
			}
			if (input.repositoryIds) {
				const primaryRepositoryId =
					input.primaryRepositoryId ?? current.primaryRepositoryId;
				if (!primaryRepositoryId) throw primaryNotIncluded();
				await setEnvironmentRepositories({
					environmentId: input.id,
					organizationId: current.organizationId,
					repositoryIds: input.repositoryIds,
					primaryRepositoryId,
				});
			} else if (input.primaryRepositoryId !== undefined) {
				const included = await db.query.environmentRepositories.findFirst({
					where: and(
						eq(environmentRepositories.environmentId, input.id),
						eq(environmentRepositories.repositoryId, input.primaryRepositoryId),
					),
				});
				if (!included) throw primaryNotIncluded();
				await db
					.update(environments)
					.set({ primaryRepositoryId: input.primaryRepositoryId })
					.where(eq(environments.id, input.id));
			}
			const patch = {
				...(input.name ? { name: input.name } : {}),
				...(input.scope ? { scope: input.scope } : {}),
				...(input.scope === "personal"
					? { createdByUserId: personalOwner(current, ctx.userId) }
					: {}),
			};
			if (Object.keys(patch).length === 0) {
				return loadEnvironment(input.id, ctx);
			}
			const [row] = await db
				.update(environments)
				.set(patch)
				.where(eq(environments.id, input.id))
				.returning();
			return row;
		}),

	archive: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const environment = await loadEnvironment(input.id, ctx);
			await assertCloudAccess(ctx, environment.organizationId);
			const [archived] = await db
				.update(environments)
				.set({ archivedAt: new Date() })
				.where(eq(environments.id, environment.id))
				.returning({
					sourceKind: environments.sourceKind,
					sourceRef: environments.sourceRef,
				});
			// A golden is one environment's alone, and an archived environment
			// never forks from it again; without this it bills storage forever.
			if (archived?.sourceKind === "fork") {
				await deleteSandbox(archived.sourceRef);
			}
			return { archived: true };
		}),
} satisfies TRPCRouterRecord;
