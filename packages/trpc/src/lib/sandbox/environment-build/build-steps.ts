import {
	SANDBOX_PATHS,
	sandboxCheckoutDir,
} from "@superset/shared/sandbox/contract";
import { FatalError } from "workflow";
import {
	type BuildBoxSource,
	type BuildCommandState,
	buildBoxRootDiskAgents,
	buildBoxSnapshotId,
	buildBoxSnapshotTaken,
	createBuildBox,
	deleteSandbox,
	readBuildCommand,
	startBuildCommand,
	stopBuildBox,
} from "../vercel";
import { isProductionDeployment } from "./deployment";
import {
	BOX_READY_MS,
	BuildFailure,
	buildBoxName,
	buildBoxNameFor,
	freshBuildBoxName,
	prepareBuild,
	within,
} from "./environment-build";
import { BUILD_LIMIT_MS } from "./limits";
import { checkoutScript, goldensToDelete } from "./policy";
import {
	failBuild,
	loadBuild,
	markBuildFresh,
	markGoldenDeleted,
	recordBuildCommit,
	succeedBuild,
	undeletedGoldens,
} from "./store";

export type BuildCommandKey = "checkout" | "install";

const NOT_RUNNING = "The build is no longer running";

async function runningBuild(buildId: string) {
	const loaded = await loadBuild(buildId);
	if (!loaded || loaded.build.status !== "running") {
		throw new FatalError(NOT_RUNNING);
	}
	return loaded;
}

async function runningBoxName(buildId: string): Promise<string> {
	return buildBoxNameFor((await runningBuild(buildId)).build);
}

/**
 * The golden the build starts from, which is also what its swap is guarded
 * on; null for a build that already finished.
 */
export async function beginBuild(buildId: string): Promise<string | null> {
	"use step";
	const loaded = await loadBuild(buildId);
	if (!loaded || loaded.build.status !== "running") return null;
	return loaded.environment.sourceRef;
}

/**
 * Creates the box once: a retry finds the box by its name. An incremental
 * build forks the golden; a fresh one starts from the image. With
 * `checkRootDisk`, a fork whose disk holds agent CLIs reports it.
 */
export async function createBox(
	buildId: string,
	sourceRef: string,
	checkRootDisk: boolean,
): Promise<"ready" | "root-disk-agents"> {
	"use step";
	const { build, environment } = await runningBuild(buildId);
	const inputs = await prepareBuild(build);
	const name = buildBoxNameFor(build);
	const source: BuildBoxSource =
		build.kind === "incremental" && environment.sourceKind === "fork"
			? { kind: "fork", golden: sourceRef }
			: { kind: "image", region: environment.region };
	await within(
		createBuildBox({
			name,
			source,
			networkPolicy: inputs.networkPolicy,
			organizationId: build.organizationId,
			sessionTimeoutMs: BUILD_LIMIT_MS,
		}),
		BOX_READY_MS,
		`The box was not ready within ${BOX_READY_MS / 1000} seconds`,
	);
	if (!checkRootDisk || source.kind !== "fork") return "ready";
	return (await buildBoxRootDiskAgents(name)) ? "root-disk-agents" : "ready";
}

/** Deletes the fork of a build that will start again. */
export async function deleteFork(buildId: string): Promise<void> {
	"use step";
	await deleteSandbox(buildBoxName(buildId));
}

export async function makeFresh(buildId: string): Promise<void> {
	"use step";
	if (!(await markBuildFresh(buildId))) throw new FatalError(NOT_RUNNING);
}

export async function startCommand(
	buildId: string,
	key: BuildCommandKey,
	timeoutSeconds: number,
): Promise<void> {
	"use step";
	const { build } = await runningBuild(buildId);
	const inputs = await prepareBuild(build);
	const install = inputs.install;
	if (key === "install" && !install) {
		throw new BuildFailure(
			`No [install] in .paradev/config.toml on ${inputs.installSource}`,
		);
	}
	const primaryDir = sandboxCheckoutDir(
		SANDBOX_PATHS.workspace,
		inputs.checkouts[0]?.path ?? ".",
	);
	await startBuildCommand({
		name: buildBoxNameFor(build),
		key,
		script:
			key === "checkout" || !install
				? checkoutScript({
						root: SANDBOX_PATHS.workspace,
						checkouts: inputs.checkouts,
					})
				: ["set -euo pipefail", ...install.commands].join("\n"),
		env: inputs.env,
		...(key === "install"
			? { cwd: install?.cwd ? `${primaryDir}/${install.cwd}` : primaryDir }
			: {}),
		timeoutSeconds,
	});
}

/** Reads the command; a finished checkout records the primary's commit. */
export async function readCommand(
	buildId: string,
	key: BuildCommandKey,
): Promise<BuildCommandState> {
	"use step";
	const state = await readBuildCommand({
		name: await runningBoxName(buildId),
		key,
	});
	if (key === "checkout" && state.exitCode === 0) {
		const commitSha = state.tail.split("\n").at(-1) ?? "";
		if (/^[0-9a-f]{40}$/.test(commitSha)) {
			await recordBuildCommit(buildId, commitSha);
		}
	}
	return state;
}

export async function boxSnapshotId(buildId: string): Promise<string | null> {
	"use step";
	return buildBoxSnapshotId(await runningBoxName(buildId));
}

export async function stopBox(buildId: string): Promise<void> {
	"use step";
	await stopBuildBox(await runningBoxName(buildId));
}

export async function snapshotTaken(
	buildId: string,
	previous: string | null,
): Promise<boolean> {
	"use step";
	return buildBoxSnapshotTaken(await runningBoxName(buildId), previous);
}

/**
 * Makes the box the environment's golden. A retry after the swap committed
 * finds the build succeeded and does not swap again.
 */
export async function activateBuild(
	buildId: string,
	previousSourceRef: string,
): Promise<boolean> {
	"use step";
	const loaded = await loadBuild(buildId);
	if (!loaded) throw new FatalError(NOT_RUNNING);
	const name = buildBoxNameFor(loaded.build);
	if (loaded.build.status === "succeeded" && loaded.build.goldenRef === name) {
		return true;
	}
	if (loaded.build.status !== "running") throw new FatalError(NOT_RUNNING);
	return succeedBuild({
		build: loaded.build,
		previousSourceRef,
		goldenRef: name,
	});
}

/**
 * After the swap: deletes the goldens past `KEPT_GOLDENS`. A delete that fails
 * is logged and tried again by the next build. Only a production deployment
 * deletes: a preview shares production's sandboxes.
 */
export async function pruneOldGoldens(buildId: string): Promise<void> {
	"use step";
	const loaded = await loadBuild(buildId);
	if (!loaded) return;
	if (!isProductionDeployment()) {
		console.log(
			`[environment-build] ${buildId}: not a production deployment, so no old golden is deleted`,
		);
		return;
	}
	const { environment } = loaded;
	const stale = goldensToDelete(
		await undeletedGoldens(environment.id),
		environment.sourceRef,
	);
	for (const golden of stale) {
		try {
			await deleteSandbox(golden.goldenRef);
			await markGoldenDeleted(golden.id);
		} catch (error) {
			console.error(
				`[environment-build] could not delete old golden ${golden.goldenRef} of ${environment.id}`,
				error,
			);
		}
	}
}

/** Never deletes the box of a build that succeeded: that box is the golden. */
export async function failBuildAndCleanUp(
	buildId: string,
	reason: string,
): Promise<void> {
	"use step";
	await failBuild(buildId, reason);
	const loaded = await loadBuild(buildId);
	if (loaded?.build.status === "succeeded") return;
	await deleteSandbox(buildBoxName(buildId));
	await deleteSandbox(freshBuildBoxName(buildId));
}
