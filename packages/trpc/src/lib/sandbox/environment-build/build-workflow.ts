import { FatalError, sleep } from "workflow";
import { TIMED_OUT_EXIT_CODE } from "../build-command";
import {
	activateBuild,
	type BuildCommandKey,
	beginBuild,
	boxSnapshotId,
	claimFreshBuild,
	createBox,
	failBuildAndCleanUp,
	prepareBuildDrive,
	pruneOldGoldens,
	readCommand,
	restartClock,
	snapshotTaken,
	startCommand,
	stopBox,
} from "./build-steps";
import {
	BUILD_LIMIT_MESSAGE,
	BUILD_LIMIT_MS,
	BUILD_POLL_MS,
	FRESH_REBUILD_POLL_MS,
	FRESH_REBUILD_WAIT_MS,
} from "./limits";

export type BuildOutcome = "succeeded" | "failed" | "skipped";

/**
 * Builds an environment's golden from `[install]` and makes it the one new
 * workspaces start from. The box does the long work; each step only starts
 * or checks it. A failure leaves the current golden in place. A golden that
 * holds agent CLIs on its disk is rebuilt from the image, within the caps in
 * `limits.ts`; past them it is forked as before and checked again next time.
 */
export async function environmentBuildWorkflow(
	buildId: string,
): Promise<BuildOutcome> {
	"use workflow";
	let deadline = Date.now() + BUILD_LIMIT_MS;

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
		if ((await createBox(buildId, sourceRef, true)) === "root-disk-agents") {
			const waitUntil = Date.now() + FRESH_REBUILD_WAIT_MS;
			let claim = await claimFreshBuild(buildId);
			while (claim === "wait" && Date.now() < waitUntil) {
				await sleep(FRESH_REBUILD_POLL_MS);
				claim = await claimFreshBuild(buildId);
			}
			if (claim !== "claimed") await restartClock(buildId);
			await createBox(buildId, sourceRef, false);
			deadline = Date.now() + BUILD_LIMIT_MS;
		}
		await prepareBuildDrive(buildId);

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
	await pruneOldGoldens(buildId);
	return "succeeded";
}
