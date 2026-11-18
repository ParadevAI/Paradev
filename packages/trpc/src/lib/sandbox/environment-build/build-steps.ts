import {
	SANDBOX_PATHS,
	sandboxCheckoutDir,
} from "@superset/shared/sandbox/contract";
import { FatalError } from "workflow";
import { env } from "../../../env";
import {
	type BuildBoxSource,
	type BuildCommandState,
	buildBoxSnapshotId,
	buildBoxSnapshotTaken,
	createBuildBox,
	deleteSandbox,
	readBuildCommand,
	startBuildCommand,
	stopBuildBox,
} from "../vercel";
import {
	BOX_READY_MS,
	BuildFailure,
	buildBoxName,
	prepareBuild,
	pruneGoldens,
	within,
} from "./environment-build";
import { fakeBuildBox } from "./fake-build-box";
import { BUILD_LIMIT_MS } from "./limits";
import { checkoutScript } from "./policy";
import {
	failBuild,
	loadBuild,
	recordBuildCommit,
	recordBuildLog,
	succeedBuild,
} from "./store";

export type BuildCommandKey = "checkout" | "install";

const NOT_RUNNING = "The build is no longer running";

function vercelBuildBox() {
	return {
		createBuildBox,
		startBuildCommand,
		readBuildCommand,
		buildBoxSnapshotId,
		stopBuildBox,
		buildBoxSnapshotTaken,
		deleteSandbox,
	};
}

function buildBox(): ReturnType<typeof vercelBuildBox> {
	if (
		env.ENVIRONMENT_BUILD_FAKE_SANDBOX === "1" &&
		env.NODE_ENV !== "production"
	) {
		return fakeBuildBox;
	}
	return vercelBuildBox();
}

async function runningBuild(buildId: string) {
	const loaded = await loadBuild(buildId);
	if (!loaded || loaded.build.status !== "running") {
		throw new FatalError(NOT_RUNNING);
	}
	return loaded;
}

/**
 * The golden the build starts from, which is also what its swap is guarded
 * on; null for a build that already finished. Fails one with no `[install]`.
 */
export async function beginBuild(buildId: string): Promise<string | null> {
	"use step";
	const loaded = await loadBuild(buildId);
	if (!loaded || loaded.build.status !== "running") return null;
	const inputs = await prepareBuild(loaded.build);
	if (!inputs.install) {
		throw new BuildFailure(
			`No [install] in .paradev/config.toml on ${inputs.installSource}`,
		);
	}
	return loaded.environment.sourceRef;
}

/** Creates the box once: a retry finds the box by its name. */
export async function createBox(
	buildId: string,
	sourceRef: string,
): Promise<void> {
	"use step";
	const { build, environment } = await runningBuild(buildId);
	const inputs = await prepareBuild(build);
	const source: BuildBoxSource =
		build.kind === "incremental" && environment.sourceKind === "fork"
			? { kind: "fork", golden: sourceRef }
			: { kind: "image", region: environment.region };
	await within(
		buildBox().createBuildBox({
			name: buildBoxName(build.id),
			source,
			networkPolicy: inputs.networkPolicy,
			organizationId: build.organizationId,
			sessionTimeoutMs: BUILD_LIMIT_MS,
		}),
		BOX_READY_MS,
		`The box was not ready within ${BOX_READY_MS / 1000} seconds`,
	);
}

/** Where a build will wait for its drive to detach and lay the drive out before the checkout. */
export async function prepareBuildDrive(_buildId: string): Promise<void> {
	"use step";
}

export async function startCommand(
	buildId: string,
	key: BuildCommandKey,
	timeoutSeconds: number,
): Promise<void> {
	"use step";
	const { build } = await runningBuild(buildId);
	const inputs = await prepareBuild(build);
	const primaryDir = sandboxCheckoutDir(
		SANDBOX_PATHS.workspace,
		inputs.checkouts[0]?.path ?? ".",
	);
	const install = inputs.install;
	if (key === "install" && !install) {
		throw new BuildFailure(
			`No [install] in .paradev/config.toml on ${inputs.installSource}`,
		);
	}
	await buildBox().startBuildCommand({
		name: buildBoxName(build.id),
		key,
		script:
			key === "checkout" || !install
				? checkoutScript({
						root: SANDBOX_PATHS.workspace,
						checkouts: inputs.checkouts,
						remove: inputs.removedPaths,
					})
				: ["set -euo pipefail", ...install.commands].join("\n"),
		env: inputs.env,
		...(key === "install"
			? {
					cwd: install?.cwd ? `${primaryDir}/${install.cwd}` : primaryDir,
				}
			: {}),
		timeoutSeconds,
	});
}

/** Reads the command and keeps its last lines on the build row. */
export async function readCommand(
	buildId: string,
	key: BuildCommandKey,
): Promise<BuildCommandState> {
	"use step";
	const state = await buildBox().readBuildCommand({
		name: buildBoxName(buildId),
		key,
	});
	if (!(await recordBuildLog(buildId, state.tail))) {
		throw new FatalError(NOT_RUNNING);
	}
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
	return buildBox().buildBoxSnapshotId(buildBoxName(buildId));
}

export async function stopBox(buildId: string): Promise<void> {
	"use step";
	await runningBuild(buildId);
	await buildBox().stopBuildBox(buildBoxName(buildId));
}

export async function snapshotTaken(
	buildId: string,
	previous: string | null,
): Promise<boolean> {
	"use step";
	return buildBox().buildBoxSnapshotTaken(buildBoxName(buildId), previous);
}

/**
 * Makes the box the environment's golden. A retry after the swap committed
 * finds the build succeeded and does not swap again. Drive builds must move
 * the golden drive name in this same update.
 */
export async function activateBuild(
	buildId: string,
	previousSourceRef: string,
): Promise<boolean> {
	"use step";
	const name = buildBoxName(buildId);
	const loaded = await loadBuild(buildId);
	if (loaded?.build.status === "succeeded" && loaded.build.goldenRef === name) {
		return true;
	}
	if (!loaded || loaded.build.status !== "running") {
		throw new FatalError(NOT_RUNNING);
	}
	return succeedBuild({
		build: loaded.build,
		previousSourceRef,
		goldenRef: name,
	});
}

export async function pruneOldGoldens(buildId: string): Promise<void> {
	"use step";
	const loaded = await loadBuild(buildId);
	if (!loaded) return;
	await pruneGoldens({
		environmentId: loaded.build.environmentId,
		activeRef: buildBoxName(buildId),
	});
}

export async function failBuildAndCleanUp(
	buildId: string,
	reason: string,
): Promise<void> {
	"use step";
	await failBuild(buildId, reason);
	await buildBox().deleteSandbox(buildBoxName(buildId));
}
