import type {
	PullRequestCheck,
	PullRequestCheckStatus,
	PullRequestChecksStatus,
} from "../pull-request";

export function checkRunStatus(
	status: string,
	conclusion: string | null,
): PullRequestCheckStatus {
	if (status !== "COMPLETED") return "pending";

	switch (conclusion) {
		case "SUCCESS":
			return "success";
		case "FAILURE":
		case "TIMED_OUT":
		case "ACTION_REQUIRED":
		case "STARTUP_FAILURE":
			return "failure";
		case "CANCELLED":
			return "cancelled";
		case "SKIPPED":
		case "NEUTRAL":
			return "skipped";
		default:
			return "pending";
	}
}

/** A cancelled run never produced a verdict, so it fails the pull request. */
export function computeChecksStatus(
	checks: Pick<PullRequestCheck, "status">[],
): PullRequestChecksStatus {
	if (checks.length === 0) return "none";
	if (
		checks.some(
			(check) => check.status === "failure" || check.status === "cancelled",
		)
	) {
		return "failure";
	}
	if (checks.some((check) => check.status === "pending")) return "pending";
	return "success";
}
