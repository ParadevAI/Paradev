import { describe, expect, test } from "bun:test";
import { pickDefaultEnvironment } from "./default-environment";

const REPO = "repo-web";

describe("pickDefaultEnvironment", () => {
	test("takes the oldest environment that opens on the repository", () => {
		expect(
			pickDefaultEnvironment(
				[
					{ id: "mono", repositoryCount: 3, hooksRepositoryId: "repo-api" },
					{ id: "solo-old", repositoryCount: 1, hooksRepositoryId: null },
					{ id: "solo-new", repositoryCount: 1, hooksRepositoryId: REPO },
				],
				REPO,
			)?.id,
		).toBe("solo-old");
	});

	test("reuses a multi-repository environment only when it opens on the repository", () => {
		expect(
			pickDefaultEnvironment(
				[{ id: "mono", repositoryCount: 2, hooksRepositoryId: REPO }],
				REPO,
			)?.id,
		).toBe("mono");
	});

	test("never reuses one that opens on another repository", () => {
		expect(
			pickDefaultEnvironment(
				[
					{ id: "mono", repositoryCount: 2, hooksRepositoryId: "repo-api" },
					{
						id: "other-hooks",
						repositoryCount: 1,
						hooksRepositoryId: "repo-api",
					},
				],
				REPO,
			),
		).toBeUndefined();
	});
});
