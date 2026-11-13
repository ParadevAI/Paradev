import { describe, expect, it } from "bun:test";
import { groupEnvironmentsForProject } from "./groupEnvironmentsForProject";

const env = (id: string, ...repos: string[]) => ({
	id,
	repositories: repos.map((fullName) => ({ fullName })),
});

describe("groupEnvironmentsForProject", () => {
	it("links by the repository it opens on, ignoring case", () => {
		const environments = [
			env("primary", "O/REPO"),
			env("secondary", "o/other", "o/repo"),
			env("unrelated", "o/other"),
		];
		const { linked, other } = groupEnvironmentsForProject({
			environments,
			repositoryFullName: "o/repo",
		});
		expect(linked.map((row) => row.id)).toEqual(["primary"]);
		expect(other.map((row) => row.id)).toEqual(["secondary", "unrelated"]);
	});

	it("puts everything in other without a repository", () => {
		const environments = [env("a", "o/repo")];
		const { linked, other } = groupEnvironmentsForProject({
			environments,
			repositoryFullName: null,
		});
		expect(linked).toEqual([]);
		expect(other).toEqual(environments);
	});
});
