import { db } from "@superset/db/client";
import {
	type EnvironmentBuildTrigger,
	environmentBuilds,
	environments,
	type SelectEnvironmentBuild,
} from "@superset/db/schema";
import { BUILD_ERRORS } from "@superset/shared/sandbox/build-errors";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { start } from "workflow/api";
import { organizationPlan } from "../../billing/plan";
import { environmentHooks } from "../repo-hooks";
import {
	environmentRepositoryRows,
	installationTokenFor,
	primaryRepository,
} from "../repositories";
import { deleteSandbox } from "../vercel";
import { environmentBuildWorkflow } from "./build-workflow";
import { isProductionDeployment } from "./deployment";
import { buildBoxName, freshBuildBoxName } from "./environment-build";
import {
	MANUAL_BUILD_WINDOW_MS,
	MANUAL_BUILDS_PER_HOUR,
	STALE_BUILD_MS,
} from "./limits";
import { nextManualBuildAt } from "./policy";

export type BuildRefusalReason =
	| "not-found"
	| "not-paid"
	| "no-repositories"
	| "no-install"
	| "already-running"
	| "rate-limited";

export class BuildRefused extends Error {
	constructor(
		readonly reason: BuildRefusalReason,
		message: string,
		readonly retryAt?: Date,
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

/** A running build whose workflow died is failed here, and its boxes deleted. */
export async function expireStaleBuilds(environmentId: string): Promise<void> {
	const now = Date.now();
	const expired = await db
		.update(environmentBuilds)
		.set({
			status: "failed",
			error: BUILD_ERRORS.stoppedUnexpectedly,
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
	await deleteStaleBuildBoxes(expired.map((build) => build.id));
}

/**
 * Only production deletes: in a preview a stale row can be a copy of a
 * production build whose box is by now production's golden.
 */
export async function deleteStaleBuildBoxes(
	buildIds: readonly string[],
): Promise<void> {
	const names = buildIds.flatMap((id) => [
		buildBoxName(id),
		freshBuildBoxName(id),
	]);
	if (names.length === 0) return;
	if (!isProductionDeployment()) {
		console.log(
			`[environment-build] not a production deployment: would delete ${names.join(", ")}`,
		);
		return;
	}
	for (const name of names) {
		await deleteSandbox(name).catch((error: unknown) =>
			console.error(`[environment-build] could not delete box ${name}`, error),
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
 * Records a running build and starts the workflow that runs it. Refuses with a
 * `BuildRefused` the caller can show: the database's one-running-build index
 * is what refuses a second build.
 */
export async function startEnvironmentBuild(args: {
	environmentId: string;
	trigger: Exclude<EnvironmentBuildTrigger, "promote">;
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
	if (args.trigger === "manual") {
		const recent = await db
			.select({ startedAt: environmentBuilds.startedAt })
			.from(environmentBuilds)
			.where(
				and(
					eq(environmentBuilds.environmentId, environment.id),
					eq(environmentBuilds.trigger, "manual"),
					gt(
						environmentBuilds.startedAt,
						new Date(Date.now() - MANUAL_BUILD_WINDOW_MS),
					),
				),
			);
		const retryAt = nextManualBuildAt(recent.map((row) => row.startedAt));
		if (retryAt) {
			throw new BuildRefused(
				"rate-limited",
				`This environment has had ${MANUAL_BUILDS_PER_HOUR} manual builds in the last hour; the next one can start at ${retryAt.toISOString()}`,
				retryAt,
			);
		}
	}

	const repositories = await environmentRepositoryRows(environment.id);
	const primary = primaryRepository(
		repositories,
		environment.primaryRepositoryId,
	);
	if (!primary) {
		throw new BuildRefused(
			"no-repositories",
			"This environment has no repositories to build",
		);
	}
	const hooks = await environmentHooks({
		config: environment.config,
		repo: primary,
		branch: primary.defaultBranch,
		token: (await installationTokenFor(repositories))?.token ?? null,
	});
	if (!hooks?.install) {
		throw new BuildRefused(
			"no-install",
			environment.config?.trim()
				? "This environment has no [install] to build: add one to its config"
				: `This environment has no [install] to build: add one to its config, or to .paradev/config.toml on ${primary.fullName}@${primary.defaultBranch}`,
		);
	}

	let build: SelectEnvironmentBuild | undefined;
	try {
		[build] = await db
			.insert(environmentBuilds)
			.values({
				environmentId: environment.id,
				organizationId: environment.organizationId,
				trigger: args.trigger,
				kind: environment.sourceKind === "image" ? "fresh" : "incremental",
				repositoryIds: repositories.map((repository) => repository.id),
				primaryRepositoryId: primary.id,
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

	try {
		await start(environmentBuildWorkflow, [build.id], {
			attributes: { buildId: build.id, environmentId: build.environmentId },
		});
	} catch (error) {
		await db
			.update(environmentBuilds)
			.set({
				status: "failed",
				error: "The build could not be started",
				finishedAt: new Date(),
			})
			.where(eq(environmentBuilds.id, build.id));
		throw error;
	}
	return build;
}
