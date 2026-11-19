import { FatalError, sleep } from "workflow";
import { TIMED_OUT_EXIT_CODE } from "../build-command";
import {
	activateBuild,
	type BuildCommandKey,
	beginBuild,
	boxSnapshotId,
	claimFreshBuild,
	createBox,
	deleteFork,
	failBuildAndCleanUp,
	pruneOldGoldens,
	readCommand,
	snapshotTaken,
	startCommand,
	stopBox,
} from "./build-steps";
import { BUILD_LIMIT_MESSAGE, BUILD_LIMIT_MS, BUILD_POLL_MS } from "./limits";

export type BuildOutcome = "succeeded" | "failed" | "skipped";

/**
 * Builds an environment's golden from `[install]` and makes it the one new
 * workspaces start from. The box does the long work; each step only starts
 * or checks it. A failure leaves the current golden in place; a success
 * deletes the goldens past `KEPT_GOLDENS`, last. A fork whose
 * disk holds agent CLIs is rebuilt from the image while fewer than
 * `FRESH_REBUILDS_AT_ONCE` are; otherwise it is forked as before and
 * checked again next time.
 */
export async function environmentBuildWorkflow(
	buildId: string,
): Promise<BuildOutcome> {
	"use workflow";
	const deadline = Date.now() + BUILD_LIMIT_MS;

	async function waitFor(done: () => Promise<boolean>): Promise<void> {
		while (!(await done())) {
			if (Date.now() >= deadline) throw new FatalError(BUILD_LIMIT_MESSAGE);
			await sleep(BUILD_POLL_MS);
		}
	}

	async function runOnBox(key: BuildCommandKey) {
		const secondsLeft = Math.floor((deadline - Date.now()) / 1000);
		if (secondsLeft <= 0) throw new FatalError(BUILD_LIMIT_MESSAGE);
		await startCommand(buildId, key, secondsLeft);
		let state = await readCommand(buildId, key);
		await waitFor(async () => {
			if (state.exitCode !== null) return true;
			state = await readCommand(buildId, key);
			return state.exitCode !== null;
		});
		if (state.exitCode === TIMED_OUT_EXIT_CODE) {
			throw new FatalError(BUILD_LIMIT_MESSAGE);
		}
		return { exitCode: state.exitCode ?? -1, tail: state.tail };
	}

	try {
		const sourceRef = await beginBuild(buildId);
		if (sourceRef === null) return "skipped";
		if (
			(await createBox(buildId, sourceRef, true)) === "root-disk-agents" &&
			(await claimFreshBuild(buildId))
		) {
			await deleteFork(buildId);
			await createBox(buildId, sourceRef, false);
		}

		const checkout = await runOnBox("checkout");
		if (checkout.exitCode !== 0) {
			throw new FatalError(
				`Could not fetch the repositories:\n${checkout.tail}`,
			);
		}
		const install = await runOnBox("install");
		if (install.exitCode !== 0) {
			throw new FatalError(
				`[install] exited with ${install.exitCode}:\n${install.tail}`,
			);
		}

		const previousSnapshot = await boxSnapshotId(buildId);
		await stopBox(buildId);
		await waitFor(() => snapshotTaken(buildId, previousSnapshot));
		if (!(await activateBuild(buildId, sourceRef))) {
			throw new FatalError(
				"The environment changed during the build; its current snapshot was kept",
			);
		}
	} catch (error) {
		await failBuildAndCleanUp(
			buildId,
			FatalError.is(error) ? error.message : "The build stopped unexpectedly",
		);
		return "failed";
	}
	try {
		await pruneOldGoldens(buildId);
	} catch (error) {
		console.error(
			`[environment-build] ${buildId}: old goldens not deleted; the next build tries again`,
			error,
		);
	}
	return "succeeded";
}
