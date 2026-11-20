import * as Sentry from "@sentry/core";
import { db, dbWs } from "@superset/db/client";
import {
	environmentBuilds,
	environmentProjects,
	environmentRepositories,
	environmentScopeValues,
	environmentSecrets,
	environments,
	githubRepositories,
	type SelectEnvironmentBuild,
} from "@superset/db/schema";
import { isCloudUsageRefusal, MACHINE_SIZES } from "@superset/shared/billing";
import { SANDBOX_IMAGE_NAME } from "@superset/shared/constants";
import { parseProjectConfig } from "@superset/shared/project-config";
import { SANDBOX_REGION_IDS } from "@superset/shared/sandbox/regions";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import {
	assertCloudAccess,
	assertMember,
	isMember,
	type MemberContext,
} from "../../lib/cloud-guards";
import { controlTags } from "../../lib/control-log";
import {
	deleteSandbox,
	environmentRepositoryRows,
	loadRepositories,
	primaryRepository,
	promoteSandboxToEnvironment,
	RepositoryError,
	sandboxExists,
	sortRepositories,
	workspaceRepositories,
} from "../../lib/sandbox";
import {
	type BuildRefusalReason,
	BuildRefused,
	isStale,
	keptGoldenRefs,
	markGoldenDeleted,
	markGoldenRefDeleted,
	restoreGolden,
	startEnvironmentBuild,
	undeletedGoldens,
} from "../../lib/sandbox/environment-build";
import { personProcedure, userError } from "../../trpc";
import { loadVisibleWorkspace } from "../cloud-workspace/access";
import { isLiveStatus } from "../cloud-workspace/live";
import { assertMachineSizeOffered } from "../cloud-workspace/start";
import { wakeAfterStop } from "../cloud-workspace/wake";
import { verifyOrgAdmin } from "../integration/utils";
import { currentBundleSha } from "./current-bundle";
import {
	assertEnvironmentCapacity,
	assertEnvironmentCapacityLocked,
} from "./limit";
import { regionForRequest } from "./region-for-request";
import { secretsRouter } from "./secrets";
import { decryptSecret, encryptSecret } from "./secrets/utils/crypto";

async function assertCanChangeForEveryone(
	environment: {
		scope: string;
		createdByUserId: string | null;
		organizationId: string;
	},
	ctx: MemberContext,
) {
	if (
		environment.scope === "organization" &&
		environment.createdByUserId !== ctx.principal.userId
	) {
		await verifyOrgAdmin(ctx.principal.userId, environment.organizationId);
	}
}

const CONFIG_MAX_LENGTH = 64 * 1024;

/** A config with no settings clears it; anything else must parse as a `config.toml`. */
function validConfig(text: string | null): string | null {
	if (text === null || text.trim().length === 0) return null;
	const parsed = parseProjectConfig(text);
	if (!parsed.ok) {
		const details = parsed.errors
			.map((error) =>
				error.line ? `line ${error.line}: ${error.message}` : error.message,
			)
			.join("; ");
		throw userError({
			code: "BAD_REQUEST",
			message: `This config is invalid: ${details}`,
			i18nKey: "serverError.environment.invalidConfig",
			params: { details },
		});
	}
	return Object.keys(parsed.config).length === 0 ? null : text;
}

/** An environment the caller may see; another member's personal one does not exist to them. */
export async function loadEnvironment(id: string, ctx: MemberContext) {
	const row = await db.query.environments.findFirst({
		where: and(eq(environments.id, id), isNull(environments.archivedAt)),
	});
	const visible =
		row &&
		(await isMember(ctx, row.organizationId)) &&
		(row.scope !== "personal" || row.createdByUserId === ctx.principal.userId);
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

async function projectIdsByEnvironment(environmentIds: readonly string[]) {
	const rows = environmentIds.length
		? await db
				.select({
					environmentId: environmentProjects.environmentId,
					projectId: environmentProjects.projectId,
				})
				.from(environmentProjects)
				.where(inArray(environmentProjects.environmentId, [...environmentIds]))
		: [];
	const map = new Map<string, string[]>();
	for (const { environmentId, projectId } of rows) {
		map.set(environmentId, [...(map.get(environmentId) ?? []), projectId]);
	}
	return map;
}

async function linkProject(args: {
	environmentId: string;
	organizationId: string;
	projectId: string;
}) {
	await db
		.insert(environmentProjects)
		.values(args)
		.onConflictDoNothing({
			target: [
				environmentProjects.environmentId,
				environmentProjects.projectId,
			],
		});
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

/** A box is built for its repositories, so an environment keeps the ones it was created with. */
async function assertRepositoriesUnchanged(
	current: { id: string; primaryRepositoryId: string | null },
	input: { repositoryIds?: readonly string[]; primaryRepositoryId?: string },
): Promise<void> {
	const changesPrimary =
		input.primaryRepositoryId !== undefined &&
		input.primaryRepositoryId !== current.primaryRepositoryId;
	let changesRepositories = false;
	if (input.repositoryIds) {
		const currentIds = new Set(
			(await environmentRepositoryRows(current.id)).map((row) => row.id),
		);
		const nextIds = new Set(input.repositoryIds);
		changesRepositories =
			nextIds.size !== currentIds.size ||
			[...nextIds].some((id) => !currentIds.has(id));
	}
	if (changesPrimary || changesRepositories) {
		throw userError({
			code: "FORBIDDEN",
			message:
				"An environment's repositories can't change. Create a new environment for other repositories.",
			i18nKey: "serverError.environment.repositoriesFixed",
		});
	}
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
	if (!isLiveStatus(workspace.status)) {
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

const BUILD_REFUSALS: Record<
	BuildRefusalReason,
	{
		code:
			| "NOT_FOUND"
			| "FORBIDDEN"
			| "PRECONDITION_FAILED"
			| "CONFLICT"
			| "TOO_MANY_REQUESTS";
		i18nKey: string;
	}
> = {
	"not-found": {
		code: "NOT_FOUND",
		i18nKey: "serverError.environment.environmentNotFound",
	},
	"not-paid": {
		code: "FORBIDDEN",
		i18nKey: "serverError.environment.notIncluded",
	},
	"no-repositories": {
		code: "PRECONDITION_FAILED",
		i18nKey: "serverError.cloudWorkspace.environmentHasNoRepositories",
	},
	"no-install": {
		code: "PRECONDITION_FAILED",
		i18nKey: "serverError.environment.noInstall",
	},
	"already-running": {
		code: "CONFLICT",
		i18nKey: "serverError.environment.buildAlreadyRunning",
	},
	"rate-limited": {
		code: "TOO_MANY_REQUESTS",
		i18nKey: "serverError.environment.manualBuildsRateLimited",
	},
};

/**
 * What a client sees of a build; a running build whose workflow died reads as
 * failed. Only a golden retention keeps (`keptGoldenRefs`) is restorable.
 */
function toBuildView(
	build: SelectEnvironmentBuild,
	activeRef: string,
	kept: ReadonlySet<string>,
) {
	const stale = isStale(build);
	return {
		id: build.id,
		status: stale ? ("failed" as const) : build.status,
		trigger: build.trigger,
		kind: build.kind,
		commitSha: build.commitSha,
		error: stale ? "The build stopped unexpectedly" : build.error,
		startedAt: build.startedAt,
		finishedAt: build.finishedAt,
		active: build.goldenRef !== null && build.goldenRef === activeRef,
		restorable:
			build.status === "succeeded" &&
			build.goldenRef !== null &&
			kept.has(build.goldenRef) &&
			build.goldenRef !== activeRef,
	};
}

export const environmentRouter = {
	secrets: secretsRouter,

	suggestRegion: personProcedure.query(({ ctx }) => ({
		region: regionForRequest(ctx.headers),
	})),

	list: personProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			await assertMember(ctx, input.organizationId);
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
							eq(environments.createdByUserId, ctx.principal.userId),
						),
					),
				)
				.orderBy(asc(environments.name));
			const ids = rows.map((row) => row.id);
			const [repos, projects] = await Promise.all([
				repositoriesByEnvironment(rows),
				projectIdsByEnvironment(ids),
			]);
			return rows.map((row) => ({
				...row,
				repositories: repos.get(row.id) ?? [],
				projectIds: projects.get(row.id) ?? [],
			}));
		}),

	get: personProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const row = await loadEnvironment(input.id, ctx);
			await assertCloudAccess(ctx, row.organizationId);
			const [repos, projects] = await Promise.all([
				repositoriesByEnvironment([row]),
				projectIdsByEnvironment([row.id]),
			]);
			return {
				...row,
				repositories: repos.get(row.id) ?? [],
				projectIds: projects.get(row.id) ?? [],
			};
		}),

	create: personProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				name: z.string().min(1).max(100),
				repositoryIds: z.array(z.string().uuid()).min(1).max(20),
				/** The repository a workspace opens on; its Paradev config runs. */
				primaryRepositoryId: z.string().uuid(),
				scope: z.enum(environmentScopeValues).default("organization"),
				/** Where its boxes run; the region nearest the caller when omitted. */
				region: z.enum(SANDBOX_REGION_IDS).optional(),
				projectId: z.string().min(1).max(200).optional(),
				/** The size its workspaces boot at; omitted = the organization's default. */
				machineSize: z.enum(MACHINE_SIZES).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await assertMember(ctx, input.organizationId);
			await assertCloudAccess(ctx, input.organizationId);
			await assertMachineSizeOffered(input.organizationId, input.machineSize);
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
						machineSize: input.machineSize ?? null,
						createdByUserId: ctx.principal.userId,
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
				if (input.projectId) {
					await linkProject({
						environmentId: row.id,
						organizationId: input.organizationId,
						projectId: input.projectId,
					});
				}
			} catch (error) {
				await db.delete(environments).where(eq(environments.id, row.id));
				throw error;
			}
			return { ...row, primaryRepositoryId: input.primaryRepositoryId };
		}),

	linkProject: personProcedure
		.input(
			z.object({
				environmentId: z.string().uuid(),
				projectId: z.string().min(1).max(200),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const environment = await loadEnvironment(input.environmentId, ctx);
			await assertCloudAccess(ctx, environment.organizationId);
			await linkProject({
				environmentId: environment.id,
				organizationId: environment.organizationId,
				projectId: input.projectId,
			});
			return { linked: true };
		}),

	unlinkProject: personProcedure
		.input(
			z.object({
				environmentId: z.string().uuid(),
				projectId: z.string().min(1).max(200),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const environment = await loadEnvironment(input.environmentId, ctx);
			await assertCloudAccess(ctx, environment.organizationId);
			await db
				.delete(environmentProjects)
				.where(
					and(
						eq(environmentProjects.environmentId, environment.id),
						eq(environmentProjects.projectId, input.projectId),
					),
				);
			return { linked: false };
		}),

	/** What promoting this workspace would make, before its golden is built. */
	promotePreview: personProcedure
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

	promote: personProcedure
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
				await assertCanChangeForEveryone(target, ctx);
			}
			const targetOwner =
				target && input.scope === "personal"
					? personalOwner(target, ctx.principal.userId)
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
			const golden = await promoteSandboxToEnvironment({
				sourceSandbox: workspace.providerSandboxId,
				goldenName,
				organizationId: workspace.organizationId,
			});
			const { stopped } = golden;
			const restart = async () => {
				if (!stopped) return;
				await wakeAfterStop(workspace, stopped).catch((error) => {
					console.error(
						`[environment/promote] could not restart ${workspace.id} after its snapshot`,
						error,
					);
					if (isCloudUsageRefusal(error)) return;
					Sentry.captureException(error, {
						tags: controlTags({
							cloudWorkspaceId: workspace.id,
							organizationId: workspace.organizationId,
						}),
					});
				});
			};
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
									machineSize: source?.machineSize ?? null,
									config: source?.config ?? null,
									createdByUserId: ctx.principal.userId,
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
					const savedAt = new Date();
					await tx.insert(environmentBuilds).values({
						environmentId,
						organizationId: workspace.organizationId,
						status: "succeeded",
						trigger: "promote",
						kind: "incremental",
						repositoryIds: checkouts.map((entry) => entry.repository.id),
						primaryRepositoryId,
						goldenRef: goldenName,
						startedAt: savedAt,
						finishedAt: savedAt,
					});
					return saved;
				})
				.catch(async (error: unknown) => {
					await deleteSandbox(goldenName).catch((cleanup: unknown) =>
						console.error(
							`[environment/promote] could not delete unused golden ${goldenName}`,
							cleanup,
						),
					);
					await restart();
					throw error;
				});
			if (target?.sourceKind === "fork") {
				await deleteSandbox(target.sourceRef)
					.then(() => markGoldenRefDeleted(target.id, target.sourceRef))
					.catch((error: unknown) =>
						console.error(
							`[environment/promote] ${target.id} replaced; could not delete its previous golden ${target.sourceRef}`,
							error,
						),
					);
			}
			await restart();
			return row;
		}),

	/** Builds the environment's golden from `[install]`; returns the running build at once. */
	rebuild: personProcedure
		.input(z.object({ environmentId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const environment = await loadEnvironment(input.environmentId, ctx);
			await assertCloudAccess(ctx, environment.organizationId);
			try {
				return toBuildView(
					await startEnvironmentBuild({
						environmentId: environment.id,
						trigger: "manual",
					}),
					environment.sourceRef,
					new Set(),
				);
			} catch (error) {
				if (error instanceof BuildRefused) {
					throw userError({
						...BUILD_REFUSALS[error.reason],
						message: error.message,
						...(error.retryAt
							? {
									params: {
										minutes: Math.max(
											1,
											Math.ceil(
												(error.retryAt.getTime() - Date.now()) / 60_000,
											),
										),
									},
								}
							: {}),
					});
				}
				throw error;
			}
		}),

	/** The environment's builds, newest first, each with its failure reason. */
	builds: personProcedure
		.input(
			z.object({
				environmentId: z.string().uuid(),
				limit: z.number().int().min(1).max(100).optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const environment = await loadEnvironment(input.environmentId, ctx);
			await assertCloudAccess(ctx, environment.organizationId);
			const rows = await db
				.select()
				.from(environmentBuilds)
				.where(eq(environmentBuilds.environmentId, environment.id))
				.orderBy(desc(environmentBuilds.startedAt), desc(environmentBuilds.id))
				.limit(input.limit ?? 20);
			const kept = keptGoldenRefs(
				await undeletedGoldens(environment.id),
				environment.sourceRef,
			);
			return {
				builds: rows.map((build) =>
					toBuildView(build, environment.sourceRef, kept),
				),
			};
		}),

	/** Makes an earlier build's golden the one new workspaces start from, with no build. */
	restore: personProcedure
		.input(
			z.object({
				environmentId: z.string().uuid(),
				buildId: z.string().uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const environment = await loadEnvironment(input.environmentId, ctx);
			await assertCloudAccess(ctx, environment.organizationId);
			await assertCanChangeForEveryone(environment, ctx);
			const running = await db.query.environmentBuilds.findMany({
				where: and(
					eq(environmentBuilds.environmentId, environment.id),
					eq(environmentBuilds.status, "running"),
				),
			});
			if (running.some((build) => !isStale(build))) {
				throw userError({
					...BUILD_REFUSALS["already-running"],
					message: "A build of this environment is already running",
				});
			}
			const build = await db.query.environmentBuilds.findFirst({
				where: and(
					eq(environmentBuilds.id, input.buildId),
					eq(environmentBuilds.environmentId, environment.id),
				),
			});
			const goldenRef = build?.goldenRef;
			const kept = keptGoldenRefs(
				await undeletedGoldens(environment.id),
				environment.sourceRef,
			);
			const notRestorable = () =>
				userError({
					code: "PRECONDITION_FAILED",
					message: "This build has no snapshot to restore",
					i18nKey: "serverError.environment.buildNotRestorable",
				});
			if (
				!build ||
				build.status !== "succeeded" ||
				!goldenRef ||
				goldenRef === environment.sourceRef ||
				!kept.has(goldenRef)
			) {
				throw notRestorable();
			}
			if (!(await sandboxExists(goldenRef))) {
				await markGoldenDeleted(build.id);
				throw notRestorable();
			}
			const restored = await restoreGolden({
				build,
				goldenRef,
				previousSourceRef: environment.sourceRef,
			});
			if (!restored) {
				throw userError({
					code: "CONFLICT",
					message:
						"The environment changed while it was being restored. Try again.",
					i18nKey: "serverError.environment.changedDuringRestore",
				});
			}
			return toBuildView(build, goldenRef, kept);
		}),

	update: personProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().min(1).max(100).optional(),
				repositoryIds: z.array(z.string().uuid()).min(1).max(20).optional(),
				primaryRepositoryId: z.string().uuid().optional(),
				scope: z.enum(environmentScopeValues).optional(),
				/** Null goes back to the organization's default. */
				machineSize: z.enum(MACHINE_SIZES).nullable().optional(),
				/** The environment's `config.toml`; null clears it. */
				config: z.string().max(CONFIG_MAX_LENGTH).nullable().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const current = await loadEnvironment(input.id, ctx);
			await assertCloudAccess(ctx, current.organizationId);
			if (
				input.machineSize !== undefined ||
				input.config !== undefined ||
				(input.scope !== undefined && input.scope !== current.scope)
			) {
				await assertCanChangeForEveryone(current, ctx);
			}
			const config =
				input.config === undefined ? undefined : validConfig(input.config);
			await assertMachineSizeOffered(current.organizationId, input.machineSize);
			await assertRepositoriesUnchanged(current, input);

			const patch = {
				...(input.name ? { name: input.name } : {}),
				...(input.scope ? { scope: input.scope } : {}),
				...(input.machineSize !== undefined
					? { machineSize: input.machineSize }
					: {}),
				...(config !== undefined ? { config } : {}),
				...(input.scope === "personal"
					? { createdByUserId: personalOwner(current, ctx.principal.userId) }
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

	archive: personProcedure
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
