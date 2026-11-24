import { createHash } from "node:crypto";
import { publishCloudWorkspaceJob } from "../../../router/cloud-workspace/jobs";
import { DAILY_BUILD_WINDOW_MS } from "./limits";
import { DAILY_PAUSE_AFTER_FAILURES, dailyBuildsPaused } from "./policy";
import {
	type BuildRefusalReason,
	BuildRefused,
	organizationMayBuild,
	startEnvironmentBuild,
} from "./start";
import { activeEnvironments, finishedBuilds } from "./store";

export const DAILY_BUILD_JOB_PATH = "/api/environments/jobs/daily-build";

export interface DailyBuildOutcome {
	queued: number;
	skipped: Partial<Record<"not-paid" | "paused", number>>;
}

/** The same environment gets the same offset every day, so its builds stay a day apart. */
export function dailyBuildDelaySeconds(environmentId: string): number {
	const hash = createHash("sha256").update(environmentId).digest();
	return Math.floor(
		(hash.readUInt32BE(0) / 2 ** 32) * (DAILY_BUILD_WINDOW_MS / 1000),
	);
}

/**
 * Queues one job per environment that can have a daily build: not archived,
 * on a paid plan, and not paused by three failures in a row. The job starts
 * the build, which refuses one with no `[install]` or one already running.
 */
export async function queueDailyBuilds(
	now = new Date(),
): Promise<DailyBuildOutcome> {
	const outcome: DailyBuildOutcome = { queued: 0, skipped: {} };
	const skip = (reason: keyof DailyBuildOutcome["skipped"]) => {
		outcome.skipped[reason] = (outcome.skipped[reason] ?? 0) + 1;
	};
	const day = now.toISOString().slice(0, 10);
	const paid = new Map<string, boolean>();
	for (const environment of await activeEnvironments()) {
		let mayBuild = paid.get(environment.organizationId);
		if (mayBuild === undefined) {
			mayBuild = await organizationMayBuild(environment.organizationId);
			paid.set(environment.organizationId, mayBuild);
		}
		if (!mayBuild) {
			skip("not-paid");
			continue;
		}
		if (
			dailyBuildsPaused(
				await finishedBuilds(environment.id, DAILY_PAUSE_AFTER_FAILURES),
			)
		) {
			skip("paused");
			continue;
		}
		await publishCloudWorkspaceJob({
			path: DAILY_BUILD_JOB_PATH,
			body: { environmentId: environment.id },
			delaySeconds: dailyBuildDelaySeconds(environment.id),
			deduplicationId: `environment-daily-build-${environment.id}-${day}`,
			runLocally: ({ environmentId }) => runDailyBuild(environmentId),
		});
		outcome.queued++;
	}
	return outcome;
}

/** A refusal is an answer, not a failure: the job reports it and is not retried. */
export async function runDailyBuild(
	environmentId: string,
): Promise<{ started: true } | { refused: BuildRefusalReason }> {
	try {
		await startEnvironmentBuild({ environmentId, trigger: "daily" });
		return { started: true };
	} catch (error) {
		if (error instanceof BuildRefused) return { refused: error.reason };
		throw error;
	}
}
