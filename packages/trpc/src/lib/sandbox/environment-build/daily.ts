import { DAILY_PAUSE_AFTER_FAILURES, dailyBuildsPaused } from "./policy";
import {
	type BuildRefusalReason,
	BuildRefused,
	organizationMayBuild,
	startEnvironmentBuild,
} from "./start";
import { activeEnvironments, finishedBuilds } from "./store";

export interface DailyBuildOutcome {
	queued: number;
	skipped: Partial<Record<BuildRefusalReason | "paused", number>>;
	failed: number;
}

/**
 * Starts a build of every environment that can have one: not archived, on a
 * paid plan, with `[install]`, and not paused by three failures in a row. No
 * change check: an unchanged environment is built too.
 */
export async function queueDailyBuilds(): Promise<DailyBuildOutcome> {
	const outcome: DailyBuildOutcome = { queued: 0, skipped: {}, failed: 0 };
	const skip = (reason: keyof DailyBuildOutcome["skipped"]) => {
		outcome.skipped[reason] = (outcome.skipped[reason] ?? 0) + 1;
	};
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
		try {
			await startEnvironmentBuild({
				environmentId: environment.id,
				trigger: "daily",
			});
			outcome.queued++;
		} catch (error) {
			if (error instanceof BuildRefused) {
				skip(error.reason);
				continue;
			}
			outcome.failed++;
			console.error(
				`[environment-build] daily build of ${environment.id} could not start`,
				error,
			);
		}
	}
	return outcome;
}
