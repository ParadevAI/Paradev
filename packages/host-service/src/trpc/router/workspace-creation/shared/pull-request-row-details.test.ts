import { describe, expect, test } from "bun:test";
import { fetchPullRequestRowDetails } from "./pull-request-row-details";

function checksPage(cursor: string) {
	return {
		repository: {
			pr7: {
				number: 7,
				statusCheckRollup: {
					contexts: {
						nodes: [],
						pageInfo: { hasNextPage: true, endCursor: cursor },
					},
				},
			},
		},
	};
}

const repo = { owner: "acme", name: "api" };

describe("fetchPullRequestRowDetails pagination", () => {
	test("stops when GitHub hands back a cursor it already returned", async () => {
		const cursors = ["a", "b", "a"];
		let calls = 0;
		await expect(
			fetchPullRequestRowDetails(
				async () => checksPage(cursors[calls++] ?? "z"),
				repo,
				[7],
			),
		).rejects.toThrow("Check-rollup cursor repeated for PR #7");
		expect(calls).toBe(3);
	});

	test("stops after a fixed number of pages when every cursor is new", async () => {
		let calls = 0;
		await expect(
			fetchPullRequestRowDetails(
				async () => checksPage(`cursor-${calls++}`),
				repo,
				[7],
			),
		).rejects.toThrow("Check rollup ran past");
		expect(calls).toBe(20);
	});
});
