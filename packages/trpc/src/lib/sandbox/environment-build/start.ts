import { db } from "@superset/db/client";
import {
	type EnvironmentBuildTrigger,
	environmentBuilds,
	environments,
	type SelectEnvironmentBuild,
} from "@superset/db/schema";
import { and, eq, isNull, lt } from "drizzle-orm";
import { publishCloudWorkspaceJob } from "../../../router/cloud-workspace/jobs";
import { organizationPlan } from "../../billing/plan";
import { readRepoHooks } from "../repo-hooks";
import {
	environmentRepositoryRows,
	installationTokenFor,
	loadRepositories,
	primaryRepository,
} from "../repositories";
import { deleteSandbox } from "../vercel";
import { buildBoxName, rebuildEnvironment } from "./environment-build";
import { buildKind, freshDropsWorkspaceSetup, STALE_BUILD_MS } from "./policy";

export const BUILD_JOB_PATH = "/api/environments/build";

export type BuildRefusalReason =
	| "not-found"
	| "not-paid"
	| "no-repositories"
	| "no-install"
	| "fresh-drops-workspace-setup"
	| "already-running";

export class BuildRefused extends Error {
	constructor(
		readonly reason: BuildRefusalReason,
		message: string,
	) {
		super(message);
		this.name = "BuildRefused";
	}
}

/** Builds are not metered, so the gate is the plan alone. */
export async function organizationMayBuild(
	organizationId: string,
): Promise<boolean> {
	return (await organizationPlan(organizationId)) !== "free";
}

/** A running build whose job died is failed here, and its box deleted. */
export async function expireStaleBuilds(
	environmentId: string,
	now = Date.now(),
): Promise<void> {
	const expired = await db
		.update(environmentBuilds)
		.set({
			status: "failed",
			error: "The build stopped unexpectedly",
			finishedAt: new Date(now),
		})
		.where(
			and(
				eq(environmentBuilds.environmentId, environmentId),
				eq(environmentBuilds.status, "running"),
				lt(environmentBuilds.startedAt, new Date(now - STALE_BUILD_MS)),
			),
		)
		.returning({ id: environmentBuilds.id });
	for (const { id } of expired) {
		await deleteSandbox(buildBoxName(id)).catch((error: unknown) =>
			console.error(`[environment-build] could not delete box of ${id}`, error),
		);
	}
}

function isUniqueViolation(error: unknown): boolean {
	const code =
		(error as { code?: unknown })?.code ??
		(error as { cause?: { code?: unknown } })?.cause?.code;
	return code === "23505";
}

/**
 * Records a running build and queues the job that runs it. Refuses with a
 * `BuildRefused` the caller can show: the database's one-running-build index
 * is what refuses a second build.
 */
export async function startEnvironmentBuild(args: {
	environmentId: string;
	trigger: Exclude<EnvironmentBuildTrigger, "promote">;
	startedByUserId?: string | null;
	fresh?: boolean;
	discardWorkspaceSetup?: boolean;
	repositoryIds?: readonly string[];
	primaryRepositoryId?: string;
}): Promise<SelectEnvironmentBuild> {
	const environment = await db.query.environments.findFirst({
		where: and(
			eq(environments.id, args.environmentId),
			isNull(environments.archivedAt),
		),
	});
	if (!environment) {
		throw new BuildRefused("not-found", "Environment not found");
	}
	if (!(await organizationMayBuild(environment.organizationId))) {
		throw new BuildRefused(
			"not-paid",
			"Environment builds come with the Team and Ultra plans: upgrade in Settings, Billing",
		);
	}
	await expireStaleBuilds(environment.id);

	const repositories = args.repositoryIds
		? await loadRepositories({
				organizationId: environment.organizationId,
				repositoryIds: args.repositoryIds,
			})
		: await environmentRepositoryRows(environment.id);
	const primary = primaryRepository(
		repositories,
		args.primaryRepositoryId ?? environment.primaryRepositoryId,
	);
	if (!primary) {
		throw new BuildRefused(
			"no-repositories",
			"This environment has no repositories to build",
		);
	}
	const hooks = await readRepoHooks({
		repo: primary,
		branch: primary.defaultBranch,
		token: await installationTokenFor(repositories),
	});
	if (!hooks?.install) {
		throw new BuildRefused(
			"no-install",
			`This environment has no [install] to build: add one to .superset/config.toml on ${primary.fullName}@${primary.defaultBranch}`,
		);
	}

	const kind = buildKind({
		sourceKind: environment.sourceKind,
		fresh: args.fresh ?? false,
	});
	if (kind === "fresh" && !args.discardWorkspaceSetup) {
		const active = await db.query.environmentBuilds.findFirst({
			where: and(
				eq(environmentBuilds.environmentId, environment.id),
				eq(environmentBuilds.goldenRef, environment.sourceRef),
			),
			columns: { trigger: true },
		});
		if (
			freshDropsWorkspaceSetup({
				sourceKind: environment.sourceKind,
				activeTrigger: active?.trigger ?? null,
			})
		) {
			throw new BuildRefused(
				"fresh-drops-workspace-setup",
				"This environment's snapshot was saved from a workspace. A build from the base image keeps only what [install] sets up; pass --discard-workspace-setup if that is everything it needs",
			);
		}
	}

	let build: SelectEnvironmentBuild | undefined;
	try {
		[build] = await db
			.insert(environmentBuilds)
			.values({
				environmentId: environment.id,
				organizationId: environment.organizationId,
				startedByUserId: args.startedByUserId ?? null,
				trigger: args.trigger,
				kind,
				repositoryIds: repositories.map((repository) => repository.id),
				primaryRepositoryId: primary.id,
				baseBranch: primary.defaultBranch,
			})
			.returning();
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw new BuildRefused(
				"already-running",
				"A build of this environment is already running",
			);
		}
		throw error;
	}
	if (!build) throw new Error("Could not record the build");

	const queued = build;
	try {
		await publishCloudWorkspaceJob({
			path: BUILD_JOB_PATH,
			body: { buildId: queued.id },
			runLocally: ({ buildId }) => rebuildEnvironment({ buildId }),
		});
	} catch (error) {
		await db
			.update(environmentBuilds)
			.set({
				status: "failed",
				error: "The build could not be queued",
				finishedAt: new Date(),
			})
			.where(eq(environmentBuilds.id, queued.id));
		throw error;
	}
	return queued;
}
