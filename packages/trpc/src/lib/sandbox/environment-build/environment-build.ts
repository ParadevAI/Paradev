import type { SelectEnvironmentBuild } from "@superset/db/schema";
import type { ResolvedPhase } from "@superset/shared/project-config";
import {
	SANDBOX_PATHS,
	sandboxCheckoutDir,
	sandboxRepositoryPath,
} from "@superset/shared/sandbox-contract";
import type { NetworkPolicy } from "@vercel/sandbox";
import { resolveEnvironment } from "../../../router/environment/resolve-environment";
import { deriveSandboxCredentials } from "../credentials";
import { readRepoHooks } from "../repo-hooks";
import {
	cloneUrl,
	installationTokenFor,
	loadRepositories,
	RepositoryError,
} from "../repositories";
import {
	type BuildBoxSource,
	type BuildCommandResult,
	createBuildBox,
	deleteSandbox,
	runBuildCommand,
	snapshotBuildBox,
} from "../vercel";
import {
	type BuildBudgets,
	type BuildCheckout,
	checkoutScript,
	DEFAULT_BUILD_BUDGETS,
	failureTail,
	goldensToDelete,
	installScript,
} from "./policy";
import { type BuildStore, buildStore } from "./store";

const BUILD_AUTHOR = { name: "Superset", email: "noreply@superset.sh" };

export function buildBoxName(buildId: string): string {
	return `envb-${buildId.replaceAll("-", "").slice(0, 24)}`;
}

export interface BuildInputs {
	install: ResolvedPhase | null;
	installSource: string;
	checkouts: BuildCheckout[];
	networkPolicy: NetworkPolicy;
	env: Record<string, string>;
}

export interface BuildBox {
	create(args: {
		name: string;
		source: BuildBoxSource;
		networkPolicy: NetworkPolicy;
		organizationId: string;
		sessionTimeoutMs: number;
	}): Promise<void>;
	run(args: {
		name: string;
		script: string;
		env: Record<string, string>;
		cwd?: string;
		timeoutMs: number;
	}): Promise<BuildCommandResult>;
	snapshot(args: { name: string; timeoutMs: number }): Promise<void>;
	remove(name: string): Promise<void>;
}

export interface BuildDeps {
	store: BuildStore;
	box: BuildBox;
	prepare(build: SelectEnvironmentBuild): Promise<BuildInputs>;
	budgets: BuildBudgets;
	now(): number;
}

class BuildFailure extends Error {}

async function within<T>(
	work: Promise<T>,
	timeoutMs: number,
	reason: string,
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new BuildFailure(reason)), timeoutMs);
	});
	try {
		return await Promise.race([work, timeout]);
	} finally {
		clearTimeout(timer);
	}
}

function seconds(ms: number): number {
	return Math.round(ms / 1000);
}

/** The primary repository first, each at the path a workspace has it. */
async function prepareBuild(
	build: SelectEnvironmentBuild,
): Promise<BuildInputs> {
	const repositories = await loadRepositories({
		organizationId: build.organizationId,
		repositoryIds: build.repositoryIds,
	});
	const primary =
		repositories.find((row) => row.id === build.primaryRepositoryId) ??
		repositories[0];
	if (!primary) throw new BuildFailure("The environment has no repositories");
	const ordered = [
		primary,
		...repositories.filter((row) => row.id !== primary.id),
	];
	const baseBranch = build.baseBranch ?? primary.defaultBranch;
	const token = await installationTokenFor(ordered);
	const [hooks, environment] = await Promise.all([
		readRepoHooks({ repo: primary, branch: baseBranch, token }),
		resolveEnvironment(build.environmentId, build.organizationId),
	]);
	const { networkPolicy, managedEnv } = await deriveSandboxCredentials({
		workspaceId: build.id,
		environmentEnv: environment?.envs ?? {},
		userAgentEnv: {},
		githubToken: token,
		gitAuthor: BUILD_AUTHOR,
	});
	return {
		install: hooks?.install ?? null,
		installSource: `${primary.fullName}@${baseBranch}`,
		checkouts: ordered.map((repository) => ({
			url: cloneUrl(repository),
			branch:
				repository.id === primary.id ? baseBranch : repository.defaultBranch,
			path: sandboxRepositoryPath(repository, ordered),
		})),
		networkPolicy,
		env: { ...managedEnv, SUPERSET_ENV: "cloud" },
	};
}

export const defaultBuildDeps: BuildDeps = {
	store: buildStore,
	box: {
		create: createBuildBox,
		run: runBuildCommand,
		snapshot: snapshotBuildBox,
		remove: deleteSandbox,
	},
	prepare: prepareBuild,
	budgets: DEFAULT_BUILD_BUDGETS,
	now: Date.now,
};

/**
 * Builds an environment's golden from `[install]` and makes it the one new
 * workspaces start from. A failure leaves the current golden in place.
 */
export async function rebuildEnvironment(
	args: { buildId: string },
	deps: BuildDeps = defaultBuildDeps,
): Promise<"succeeded" | "failed" | "skipped"> {
	const loaded = await deps.store.load(args.buildId);
	if (!loaded || loaded.build.status !== "running") return "skipped";
	const { build, environment } = loaded;
	const name = buildBoxName(build.id);
	const { budgets } = deps;
	const deadline = deps.now() + budgets.jobMs;
	const remaining = (step: string) => {
		const left = deadline - deps.now();
		if (left <= 0) {
			throw new BuildFailure(
				`The build ran out of time before ${step} (${seconds(budgets.jobMs)} seconds)`,
			);
		}
		return left;
	};
	let boxCreated = false;
	try {
		const inputs = await deps.prepare(build);
		if (!inputs.install) {
			throw new BuildFailure(
				`No [install] in .superset/config.toml on ${inputs.installSource}`,
			);
		}
		const source: BuildBoxSource =
			build.kind === "incremental" && environment.sourceKind === "fork"
				? { kind: "fork", golden: environment.sourceRef }
				: { kind: "image", region: environment.region };
		boxCreated = true;
		await within(
			deps.box.create({
				name,
				source,
				networkPolicy: inputs.networkPolicy,
				organizationId: build.organizationId,
				sessionTimeoutMs: budgets.jobMs,
			}),
			budgets.boxReadyMs,
			`The box was not ready within ${seconds(budgets.boxReadyMs)} seconds`,
		);

		const checkout = await deps.box.run({
			name,
			script: checkoutScript({
				root: SANDBOX_PATHS.workspace,
				checkouts: inputs.checkouts,
			}),
			env: inputs.env,
			timeoutMs: remaining("the checkout"),
		});
		if (checkout.exitCode !== 0) {
			throw new BuildFailure(
				`Could not fetch the repositories:\n${failureTail(checkout.output)}`,
			);
		}
		const commitSha = checkout.output.trim().split("\n").at(-1) ?? "";
		if (/^[0-9a-f]{40}$/.test(commitSha)) {
			await deps.store.recordCommit(build.id, commitSha);
		}

		const primaryDir = sandboxCheckoutDir(
			SANDBOX_PATHS.workspace,
			inputs.checkouts[0]?.path ?? ".",
		);
		const installMs = Math.min(budgets.installMs, remaining("[install]"));
		const install = await deps.box.run({
			name,
			script: installScript(inputs.install.commands),
			env: inputs.env,
			cwd: inputs.install.cwd
				? `${primaryDir}/${inputs.install.cwd}`
				: primaryDir,
			timeoutMs: installMs,
		});
		if (install.timedOut) {
			throw new BuildFailure(
				`[install] ran for more than ${seconds(installMs)} seconds and was stopped:\n${failureTail(install.output)}`,
			);
		}
		if (install.exitCode !== 0) {
			throw new BuildFailure(
				`[install] exited with ${install.exitCode}:\n${failureTail(install.output)}`,
			);
		}

		const snapshotMs = remaining("the snapshot");
		await within(
			deps.box.snapshot({ name, timeoutMs: snapshotMs }),
			snapshotMs,
			"The snapshot did not finish before the build ran out of time",
		);
		const swapped = await deps.store.succeed({
			build,
			previousSourceRef: environment.sourceRef,
			goldenRef: name,
		});
		if (!swapped) {
			throw new BuildFailure(
				"The environment changed during the build; its current snapshot was kept",
			);
		}
		await pruneGoldens(
			{ environmentId: build.environmentId, activeRef: name },
			deps,
		);
		return "succeeded";
	} catch (error) {
		const expected =
			error instanceof BuildFailure || error instanceof RepositoryError;
		const reason = expected ? error.message : "The build stopped unexpectedly";
		if (!expected) {
			console.error(`[environment-build] ${build.id} failed`, error);
		}
		await deps.store.fail(build.id, reason);
		if (boxCreated) {
			await deps.box
				.remove(name)
				.catch((cleanup: unknown) =>
					console.error(
						`[environment-build] could not delete build box ${name}`,
						cleanup,
					),
				);
		}
		return "failed";
	}
}

/** Keeps the newest goldens; a golden that cannot be deleted now is tried again next time. */
export async function pruneGoldens(
	args: { environmentId: string; activeRef: string },
	deps: Pick<BuildDeps, "store" | "box"> = defaultBuildDeps,
): Promise<void> {
	const stale = goldensToDelete(
		await deps.store.builds(args.environmentId),
		args.activeRef,
	);
	const deleted: string[] = [];
	for (const build of stale) {
		if (!build.goldenRef) continue;
		try {
			await deps.box.remove(build.goldenRef);
			deleted.push(build.id);
		} catch (error) {
			console.error(
				`[environment-build] could not delete old golden ${build.goldenRef}`,
				error,
			);
		}
	}
	await deps.store.markGoldensDeleted(deleted);
}
