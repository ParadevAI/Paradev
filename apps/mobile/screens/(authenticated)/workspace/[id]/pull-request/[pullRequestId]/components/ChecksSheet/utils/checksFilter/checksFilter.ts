import type { PullRequestCheck } from "../../../../../../utils/pullRequest";
import {
	effectiveCheckStatus,
	tallyChecks,
} from "../../../../../../utils/pullRequest";
import { CHECK_OUTCOME } from "../../../../utils/checkOutcome";

export type ChecksFilterValue = "all" | "running" | "failed" | "passed";

const GROUPS: {
	filter: Exclude<ChecksFilterValue, "all">;
	title: string;
	segment: string;
}[] = [
	{ filter: "running", title: "In Progress", segment: "Running" },
	{ filter: "failed", title: "Failed", segment: "Failed" },
	{ filter: "passed", title: "Passed", segment: "Passed" },
];

/** Segments to offer and groups to show; "Failed" is offered even at zero. */
export function checksFilterState(
	checks: PullRequestCheck[],
	filter: ChecksFilterValue,
) {
	const tally = tallyChecks(checks);
	const counts: Record<ChecksFilterValue, number> = {
		all: tally.total,
		running: tally.running,
		failed: tally.failed + tally.needsAction,
		passed: tally.passed,
	};

	const options = [
		{ value: "all" as ChecksFilterValue, label: "All", count: counts.all },
		...GROUPS.map((group) => ({
			value: group.filter as ChecksFilterValue,
			label: group.segment,
			count: counts[group.filter],
		})),
	].filter(
		(option) =>
			option.value === "all" ||
			option.value === "failed" ||
			counts[option.value] > 0,
	);

	const groups = GROUPS.map((group) => ({
		...group,
		members: checks.filter(
			(check) => CHECK_OUTCOME[effectiveCheckStatus(check)] === group.filter,
		),
	})).filter(
		(group) =>
			group.members.length > 0 && (filter === "all" || filter === group.filter),
	);

	return { counts, options, groups, tally };
}
