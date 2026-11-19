import { db } from "@superset/db/client";
import {
	type EnvironmentBuildTrigger,
	environmentBuilds,
	environments,
	type SelectEnvironmentBuild,
} from "@superset/db/schema";
import { and, eq, isNull, lt } from "drizzle-orm";
import { start } from "workflow/api";
import { organizationPlan } from "../../billing/plan";
import { readRepoHooks } from "../repo-hooks";
import {
	environmentRepositoryRows,
	installationTokenFor,
	primaryRepository,
} from "../repositories";
import { deleteSandbox } from "../vercel";
import { environmentBuildWorkflow } from "./build-workflow";
import { buildBoxName, freshBuildBoxName } from "./environment-build";
import { STALE_BUILD_MS } from "./limits";

export type BuildRefusalReason =
	| "not-found"
	| "not-paid"
	| "no-repositories"
	| "no-install"
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

/** A running build whose workflow died is failed here, and its box deleted. */
export async function expireStaleBuilds(environmentId: string): Promise<void> {
	const now = Date.now();
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
		for (const name of [buildBoxName(id), freshBuildBoxName(id)]) {
			await deleteSandbox(name).catch((error: unknown) =>
				console.error(
					`[environment-build] could not delete box of ${id}`,
					error,
				),
			);
		}
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
	const hooks = await readRepoHooks({
		repo: primary,
		branch: primary.defaultBranch,
		token: await installationTokenFor(repositories),
	});
	if (!hooks?.install) {
		throw new BuildRefused(
			"no-install",
			`This environment has no [install] to build: add one to .paradev/config.toml on ${primary.fullName}@${primary.defaultBranch}`,
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

	const queued = build;
	try {
		await start(environmentBuildWorkflow, [queued.id], {
			attributes: { buildId: queued.id, environmentId: queued.environmentId },
		});
	} catch (error) {
		await db
			.update(environmentBuilds)
			.set({
				status: "failed",
				error: "The build could not be started",
				finishedAt: new Date(),
			})
			.where(eq(environmentBuilds.id, queued.id));
		throw error;
	}
	return queued;
}
