import { describe, expect, test } from "bun:test";
import { pickDefaultEnvironment } from "./default-environment";

const REPO = "repo-web";

describe("pickDefaultEnvironment", () => {
	test("takes the oldest environment that opens on the repository", () => {
		expect(
			pickDefaultEnvironment(
				[
					{ id: "mono", primaryRepositoryId: "repo-api" },
					{ id: "solo-old", primaryRepositoryId: REPO },
					{ id: "solo-new", primaryRepositoryId: REPO },
				],
				REPO,
			)?.id,
		).toBe("solo-old");
	});

	test("reuses a multi-repository environment only when it opens on the repository", () => {
		expect(
			pickDefaultEnvironment([{ id: "mono", primaryRepositoryId: REPO }], REPO)
				?.id,
		).toBe("mono");
	});

	test("never reuses one that opens on another repository", () => {
		expect(
			pickDefaultEnvironment(
				[
					{ id: "mono", primaryRepositoryId: "repo-api" },
					{
						id: "other-primary",
						primaryRepositoryId: "repo-api",
					},
				],
				REPO,
			),
		).toBeUndefined();
	});
});
