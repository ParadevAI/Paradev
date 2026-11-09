import type { LinearIssueReference } from "renderer/routes/_authenticated/utils/linkedIssueFromLinear";
import { linkedRefFromText } from "../../../../utils/linkedContextChips";

export interface LinearIssuesInput {
	organizationId: string;
	status: "open" | "all";
	search: string | null;
	orderBy: "createdAt";
}

interface PickerIssue extends LinearIssueReference {
	createdAt: string;
}

export async function searchLinearIssues<T extends PickerIssue>(
	fetchIssues: (input: LinearIssuesInput) => Promise<{ issues: T[] }>,
	organizationId: string,
	query: string,
): Promise<T[]> {
	const ref = linkedRefFromText(query);
	if (ref && ref.kind !== "linear") return [];
	const { issues } = await fetchIssues({
		organizationId,
		status: query === "" ? "open" : "all",
		search: ref ? ref.identifier : query || null,
		orderBy: "createdAt",
	});
	return issues
		.filter((issue) => !ref || issue.identifier === ref.identifier)
		.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
