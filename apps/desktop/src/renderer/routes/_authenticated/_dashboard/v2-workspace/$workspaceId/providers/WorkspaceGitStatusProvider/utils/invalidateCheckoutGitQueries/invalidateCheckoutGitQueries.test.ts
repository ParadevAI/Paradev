import { beforeEach, describe, expect, test } from "bun:test";
import { invalidateCheckoutGitQueries } from "./invalidateCheckoutGitQueries";

const calls = {
	getDiffPatch: [] as unknown[][],
	getDiff: [] as unknown[][],
	getBaseBranch: [] as unknown[][],
	listCommits: [] as unknown[][],
};

const record = (key: keyof typeof calls) => ({
	invalidate: (...args: unknown[]) => {
		calls[key].push(args);
		return Promise.resolve();
	},
});

const git = {
	getDiffPatch: record("getDiffPatch"),
	getDiff: record("getDiff"),
	getBaseBranch: record("getBaseBranch"),
	listCommits: record("listCommits"),
} as unknown as Parameters<typeof invalidateCheckoutGitQueries>[0];

beforeEach(() => {
	for (const entries of Object.values(calls)) entries.length = 0;
});

describe("invalidateCheckoutGitQueries", () => {
	test("scopes a broad change to the one checkout", () => {
		invalidateCheckoutGitQueries(git, "ws", "api", undefined);
		const scope = { workspaceId: "ws", repositoryId: "api" };
		expect(calls.getDiff).toEqual([[scope]]);
		expect(calls.getBaseBranch).toEqual([[scope]]);
		expect(calls.listCommits).toEqual([[scope]]);
		expect(calls.getDiffPatch).toEqual([[scope]]);
	});

	test("scopes path edits to the checkout and leaves commit lists alone", () => {
		invalidateCheckoutGitQueries(git, "ws", "api", ["src/a.ts"]);
		expect(calls.getDiff).toEqual([
			[{ workspaceId: "ws", repositoryId: "api", path: "src/a.ts" }],
		]);
		expect(calls.listCommits).toEqual([]);
	});

	test("a workspace without checkouts keys on the workspace alone", () => {
		invalidateCheckoutGitQueries(git, "ws", undefined, undefined);
		expect(calls.getDiff).toEqual([[{ workspaceId: "ws" }]]);
	});
});
