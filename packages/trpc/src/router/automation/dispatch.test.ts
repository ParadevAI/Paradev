import { describe, expect, test } from "bun:test";
import {
	type CreateTarget,
	createOnPullRequestOrBranch,
	isSameGitHubRepository,
} from "./dispatch";
import { RelayDispatchError } from "./relay-client";

const pullRequest = {
	repository: "Acme/API",
	number: 7,
	inPrimaryRepository: false,
};
const sentPullRequest = { repository: "Acme/API", number: 7 };
const args = { pullRequest, branch: "nightly-2026", automationId: "auto-1" };

function recordingCreate(refusal?: Error) {
	const targets: CreateTarget[] = [];
	const create = async (target: CreateTarget) => {
		targets.push(target);
		if (refusal && "pullRequest" in target) throw refusal;
		return target;
	};
	return { targets, create };
}

describe("createOnPullRequestOrBranch", () => {
	test("sends the PR by its repository's owner/name", async () => {
		const { targets, create } = recordingCreate();

		await createOnPullRequestOrBranch(create, args);

		expect(targets).toEqual([{ pullRequest: sentPullRequest }]);
	});

	test("also sends the legacy `pr` for the project's primary repository", async () => {
		const { targets, create } = recordingCreate();

		await createOnPullRequestOrBranch(create, {
			...args,
			pullRequest: { ...pullRequest, inPrimaryRepository: true },
		});

		expect(targets).toEqual([{ pullRequest: sentPullRequest, pr: 7 }]);
	});

	test("branches fresh when the PR's repository is not in the project", async () => {
		const { targets, create } = recordingCreate(
			new RelayDispatchError(
				"workspaces.create: repository_not_in_project: Acme/API is not a repository of this project",
				404,
				"",
			),
		);

		const result = await createOnPullRequestOrBranch(create, args);

		expect(targets).toEqual([
			{ pullRequest: sentPullRequest },
			{ branch: "nightly-2026" },
		]);
		expect(result).toEqual({ branch: "nightly-2026" });
	});

	test("rethrows a failure the host did not answer", async () => {
		const { targets, create } = recordingCreate(new Error("timed out"));

		await expect(createOnPullRequestOrBranch(create, args)).rejects.toThrow(
			"timed out",
		);
		expect(targets).toEqual([{ pullRequest: sentPullRequest }]);
	});
});

describe("isSameGitHubRepository", () => {
	test("matches the clone URL's owner/name without case", () => {
		expect(
			isSameGitHubRepository("https://github.com/acme/api.git", "Acme/API"),
		).toBe(true);
		expect(
			isSameGitHubRepository("git@github.com:acme/web.git", "Acme/API"),
		).toBe(false);
		expect(isSameGitHubRepository(null, "Acme/API")).toBe(false);
	});
});
