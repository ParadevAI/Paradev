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
	environmentRepositoryRows,
	installationTokenFor,
	loadRepositories,
	RepositoryError,
} from "../repositories";
import {
	type BuildBoxSource,
	createBuildBox,
	deleteSandbox,
	runBuildCommand,
	snapshotBuildBox,
} from "../vercel";
import {
	type BuildCheckout,
	checkoutScript,
	goldensToDelete,
	removedCheckoutPaths,
} from "./policy";
import {
	failBuild,
	finishedBuilds,
	loadBuild,
	markGoldensDeleted,
	recordBuildCommit,
	succeedBuild,
} from "./store";

const BUILD_AUTHOR = { name: "Superset", email: "noreply@superset.sh" };
const BOX_READY_MS = 45_000;
const INSTALL_MS = 180_000;
/** Inside the job's 300 s; the checkout and the snapshot get what is left. */
const JOB_MS = 285_000;
const FAILURE_TAIL_LINES = 40;

export function buildBoxName(buildId: string): string {
	return `envb-${buildId.replaceAll("-", "").slice(0, 24)}`;
}

interface BuildInputs {
	install: ResolvedPhase | null;
	installSource: string;
	checkouts: BuildCheckout[];
	removedPaths: string[];
	networkPolicy: NetworkPolicy;
	env: Record<string, string>;
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

function failureTail(output: string): string {
	return output.trimEnd().split("\n").slice(-FAILURE_TAIL_LINES).join("\n");
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
	const baseBranch = primary.defaultBranch;
	const token = await installationTokenFor(ordered);
	const [hooks, environment, current] = await Promise.all([
		readRepoHooks({ repo: primary, branch: baseBranch, token }),
		resolveEnvironment(build.environmentId, build.organizationId),
		environmentRepositoryRows(build.environmentId),
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
		removedPaths:
			build.kind === "incremental"
				? removedCheckoutPaths({ current, nextIds: build.repositoryIds })
				: [],
		networkPolicy,
		env: { ...managedEnv, SUPERSET_ENV: "cloud" },
	};
}

/**
 * Builds an environment's golden from `[install]` and makes it the one new
 * workspaces start from. A failure leaves the current golden in place.
 */
export async function rebuildEnvironment(args: {
	buildId: string;
}): Promise<"succeeded" | "failed" | "skipped"> {
	const loaded = await loadBuild(args.buildId);
	if (!loaded || loaded.build.status !== "running") return "skipped";
	const { build, environment } = loaded;
	const name = buildBoxName(build.id);
	const deadline = Date.now() + JOB_MS;
	const remaining = (step: string) => {
		const left = deadline - Date.now();
		if (left <= 0) {
			throw new BuildFailure(
				`The build ran out of time before ${step} (${seconds(JOB_MS)} seconds)`,
			);
		}
		return left;
	};
	let boxCreated = false;
	try {
		const inputs = await prepareBuild(build);
		if (!inputs.install) {
			throw new BuildFailure(
				`No [install] in .paradev/config.toml on ${inputs.installSource}`,
			);
		}
		const source: BuildBoxSource =
			build.kind === "incremental" && environment.sourceKind === "fork"
				? { kind: "fork", golden: environment.sourceRef }
				: { kind: "image", region: environment.region };
		boxCreated = true;
		await within(
			createBuildBox({
				name,
				source,
				networkPolicy: inputs.networkPolicy,
				organizationId: build.organizationId,
				sessionTimeoutMs: JOB_MS,
			}),
			BOX_READY_MS,
			`The box was not ready within ${seconds(BOX_READY_MS)} seconds`,
		);

		const checkout = await runBuildCommand({
			name,
			script: checkoutScript({
				root: SANDBOX_PATHS.workspace,
				checkouts: inputs.checkouts,
				remove: inputs.removedPaths,
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
			await recordBuildCommit(build.id, commitSha);
		}

		const primaryDir = sandboxCheckoutDir(
			SANDBOX_PATHS.workspace,
			inputs.checkouts[0]?.path ?? ".",
		);
		const installMs = Math.min(INSTALL_MS, remaining("[install]"));
		const install = await runBuildCommand({
			name,
			script: ["set -euo pipefail", ...inputs.install.commands].join("\n"),
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
			snapshotBuildBox({ name, timeoutMs: snapshotMs }),
			snapshotMs,
			"The snapshot did not finish before the build ran out of time",
		);
		const swapped = await succeedBuild({
			build,
			previousSourceRef: environment.sourceRef,
			goldenRef: name,
		});
		if (!swapped) {
			throw new BuildFailure(
				"The environment changed during the build; its current snapshot was kept",
			);
		}
		await pruneGoldens({ environmentId: build.environmentId, activeRef: name });
		return "succeeded";
	} catch (error) {
		const expected =
			error instanceof BuildFailure || error instanceof RepositoryError;
		const reason = expected ? error.message : "The build stopped unexpectedly";
		if (!expected) {
			console.error(`[environment-build] ${build.id} failed`, error);
		}
		await failBuild(build.id, reason);
		if (boxCreated) {
			await deleteSandbox(name).catch((cleanup: unknown) =>
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
export async function pruneGoldens(args: {
	environmentId: string;
	activeRef: string;
}): Promise<void> {
	const stale = goldensToDelete(
		await finishedBuilds(args.environmentId),
		args.activeRef,
	);
	const deleted: string[] = [];
	for (const build of stale) {
		if (!build.goldenRef) continue;
		try {
			await deleteSandbox(build.goldenRef);
			deleted.push(build.id);
		} catch (error) {
			console.error(
				`[environment-build] could not delete old golden ${build.goldenRef}`,
				error,
			);
		}
	}
	await markGoldensDeleted(deleted);
}
