import { expect, test } from "bun:test";
import type { LinearClient } from "@linear/sdk";
import { fetchCommentIssue } from "./fetchCommentIssue";

test("loads all issue label pages for comment filters", async () => {
	const cursors: unknown[] = [];
	const client = {
		client: {
			rawRequest: async (
				_query: string,
				variables: { after: string | null },
			) => {
				cursors.push(variables.after);
				return {
					data: {
						issue: {
							id: "issue",
							title: "Fix login",
							identifier: "TEAM-1",
							url: "https://linear.app/issue/TEAM-1",
							team: { id: "team" },
							project: null,
							assignee: null,
							state: { id: "state" },
							labels: {
								nodes: [{ id: variables.after ? "label-2" : "label-1" }],
								pageInfo: {
									hasNextPage: !variables.after,
									endCursor: variables.after ? null : "next",
								},
							},
						},
					},
				};
			},
		},
	} as unknown as LinearClient;
	expect(await fetchCommentIssue(client, "issue")).toMatchObject({
		teamId: "team",
		projectId: null,
		assigneeId: null,
		labelIds: ["label-1", "label-2"],
	});
	expect(cursors).toEqual([null, "next"]);
});

test("an unavailable issue cannot be matched as an unrestricted comment", async () => {
	const client = {
		client: { rawRequest: async () => ({ data: { issue: null } }) },
	} as unknown as LinearClient;
	expect(await fetchCommentIssue(client, "gone")).toBeNull();
	client.client.rawRequest = async () => {
		throw new Error("Entity not found");
	};
	expect(await fetchCommentIssue(client, "gone")).toBeNull();
});

test("transient lookup failures remain retryable", async () => {
	const client = {
		client: {
			rawRequest: async () => {
				throw new Error("Rate limited");
			},
		},
	} as unknown as LinearClient;
	await expect(fetchCommentIssue(client, "issue")).rejects.toThrow(
		"Rate limited",
	);
});
