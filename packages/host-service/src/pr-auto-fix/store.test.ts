import { describe, expect, test } from "bun:test";
import { pullRequests } from "../db/schema";
import {
	createTestDb,
	PROJECT_ID,
	seedLinkedPullRequest,
} from "../trpc/router/pull-requests/shared/test-db";
import { readPullRequestObservation } from "./store.ts";

const URL = "https://github.com/octocat/hello/pull/42";
const NOW = 1_800_000_000_000;

describe("readPullRequestObservation", () => {
	test("reads the newest row when a renamed repository left two rows for one URL", () => {
		const db = createTestDb();
		seedLinkedPullRequest(db);
		db.update(pullRequests)
			.set({ headSha: "old", lastFetchedAt: NOW - 60_000 })
			.run();
		db.insert(pullRequests)
			.values({
				id: "pr-42-renamed",
				projectId: PROJECT_ID,
				repoProvider: "github",
				repoOwner: "octocat-renamed",
				repoName: "hello",
				prNumber: 42,
				url: URL,
				title: "PR 42",
				state: "open",
				headBranch: "feature/42",
				headSha: "new",
				checksJson: JSON.stringify([
					{ name: "Test", status: "failure", url: null },
				]),
				lastFetchedAt: NOW - 1_000,
			})
			.run();

		const read = (now: number) =>
			readPullRequestObservation(db, URL, { now, staleAfterMs: 10 * 60_000 });
		expect(read(NOW)).toMatchObject({
			state: "open",
			headSha: "new",
			checks: [{ status: "failure" }],
		});
		expect(read(NOW + 11 * 60_000)?.headSha).toBeNull();
	});
});
