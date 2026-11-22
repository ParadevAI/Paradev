export interface RowDetailInput {
	/** The row's live state, e.g. "Needs input"; null when it has none. */
	state: string | null;
	/** Its pull request's status word and ink, shown when there is no state. */
	pullRequest: { label: string; ink: string } | null;
	diff: { additions: number; deletions: number } | null;
	name: string;
	branch: string | null;
	/** Replaces the branch, e.g. "project · host" outside its project. */
	context?: string | null;
	noChanges: string;
}

export interface RowDetailPart {
	key: "state" | "diff" | "branch" | "empty";
	text: string;
	/** A colour class for the part; null reads muted. */
	ink: string | null;
}

/** A row's second line: state, diff, then branch, each left out when it has nothing to say. */
export function rowDetailParts({
	state,
	pullRequest,
	diff,
	name,
	branch,
	context,
	noChanges,
}: RowDetailInput): RowDetailPart[] {
	const parts: RowDetailPart[] = [];
	if (state) parts.push({ key: "state", text: state, ink: null });
	else if (pullRequest) {
		parts.push({ key: "state", text: pullRequest.label, ink: pullRequest.ink });
	}
	if (diff && (diff.additions > 0 || diff.deletions > 0)) {
		parts.push({
			key: "diff",
			text: `+${diff.additions} −${diff.deletions}`,
			ink: null,
		});
	}
	const place = context || (branch && branch !== name ? branch : null);
	if (place) parts.push({ key: "branch", text: place, ink: null });
	return parts.length > 0
		? parts
		: [{ key: "empty", text: noChanges, ink: null }];
}
