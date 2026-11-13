import { describe, expect, it } from "bun:test";
import { getChangesetFileKey } from "./changesetFileKey";
import type { ChangesetFile } from "./types";

const readme: ChangesetFile = {
	path: "README.md",
	status: "modified",
	additions: 1,
	deletions: 0,
	source: { kind: "unstaged" },
};

describe("getChangesetFileKey", () => {
	it("keeps the same path in two checkouts apart", () => {
		expect(getChangesetFileKey({ ...readme, repositoryId: "api" })).not.toBe(
			getChangesetFileKey({ ...readme, repositoryId: "web" }),
		);
	});

	it("leaves untagged keys unchanged", () => {
		expect(getChangesetFileKey(readme)).toBe("unstaged:README.md");
	});
});
