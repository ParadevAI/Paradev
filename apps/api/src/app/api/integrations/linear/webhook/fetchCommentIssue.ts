import type { LinearClient } from "@linear/sdk";
import { isLinearNotFoundError } from "@superset/trpc/integrations/linear";
import type { LinearCommentIssue } from "./normalizeLinearDelivery";

interface IssueResponse {
	issue: {
		id: string;
		title: string;
		identifier: string;
		url: string;
		team: { id: string };
		project: { id: string } | null;
		state: { id: string };
		assignee: { id: string } | null;
		labels: {
			nodes: { id: string }[];
			pageInfo: { hasNextPage: boolean; endCursor: string | null };
		};
	} | null;
}

export async function fetchCommentIssue(
	client: LinearClient,
	issueId: string,
): Promise<LinearCommentIssue | null> {
	const labelIds: string[] = [];
	let after: string | null = null;
	while (true) {
		const response: { data?: IssueResponse } = await client.client
			.rawRequest<IssueResponse, { id: string; after: string | null }>(
				`query AutomationCommentIssue($id: String!, $after: String) {
				issue(id: $id) {
					id title identifier url
					team { id }
					project { id }
					state { id }
					assignee { id }
					labels(first: 250, after: $after) {
						nodes { id }
						pageInfo { hasNextPage endCursor }
					}
				}
			}`,
				{ id: issueId, after },
			)
			.catch((error: unknown) => {
				if (isLinearNotFoundError(error)) return { data: { issue: null } };
				throw error;
			});
		if (!response.data) throw new Error("Linear returned no issue data");
		const issue = response.data.issue;
		if (!issue) return null;
		labelIds.push(...issue.labels.nodes.map((label) => label.id));
		if (!issue.labels.pageInfo.hasNextPage) {
			return {
				id: issue.id,
				title: issue.title,
				identifier: issue.identifier,
				url: issue.url,
				teamId: issue.team.id,
				projectId: issue.project?.id ?? null,
				stateId: issue.state.id,
				assigneeId: issue.assignee?.id ?? null,
				labelIds,
			};
		}
		const cursor = issue.labels.pageInfo.endCursor;
		if (!cursor || cursor === after) {
			throw new Error("Linear returned an invalid label cursor");
		}
		after = cursor;
	}
}
