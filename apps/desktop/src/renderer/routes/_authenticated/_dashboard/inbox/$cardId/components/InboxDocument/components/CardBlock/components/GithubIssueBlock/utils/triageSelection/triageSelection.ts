import type { GithubIssueView } from "../../../../types";
import { fillClause } from "../../../../utils/handoffPlan";

interface Chosen {
	labels: string[];
	assignees: string[];
}

/** The names a triage sends, as the confirm lists them: the issue's own in the issue's order, then the added ones in the order they were picked. */
export function orderedSelection(
	current: string[],
	picked: string[],
): string[] {
	return [
		...current.filter((name) => picked.includes(name)),
		...picked.filter((name) => !current.includes(name)),
	];
}

/** The picks after one name is toggled; a pick past the limit changes nothing. */
export function togglePick(
	picked: string[],
	name: string,
	limit = Number.POSITIVE_INFINITY,
): string[] {
	if (picked.includes(name)) return picked.filter((each) => each !== name);
	return picked.length >= limit ? picked : [...picked, name];
}

export function sameSelection(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((name) => b.includes(name));
}

const without = (names: string[], others: string[]) =>
	names.filter((name) => !others.includes(name));

/** The confirm for a triage, which names only what changes; none when nothing does. The server builds the same sentence from the same parts and refuses an action whose sentence differs, so it is not translated. */
export function triageSentence(
	plan: GithubIssueView["plan"],
	current: Chosen,
	next: Chosen,
): string | undefined {
	const clauses = [
		[plan.addLabels, without(next.labels, current.labels)] as const,
		[plan.removeLabels, without(current.labels, next.labels)] as const,
		[plan.assign, without(next.assignees, current.assignees)] as const,
		[plan.unassign, without(current.assignees, next.assignees)] as const,
	].flatMap(([clause, names]) =>
		names.length ? [fillClause(clause, { names: names.join(", ") })] : [],
	);
	return clauses.length ? `${plan.lead}${clauses.join("; ")}?` : undefined;
}
