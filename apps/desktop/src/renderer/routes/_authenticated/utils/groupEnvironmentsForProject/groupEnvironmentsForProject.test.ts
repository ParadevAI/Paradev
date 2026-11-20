import { describe, expect, it } from "bun:test";
import { groupEnvironmentsForProject } from "./groupEnvironmentsForProject";

const env = (id: string, projectIds: string[], ...repos: string[]) => ({
	id,
	projectIds,
	repositories: repos.map((fullName) => ({ fullName })),
});

describe("groupEnvironmentsForProject", () => {
	it("links by project or by the repository it opens on, ignoring case", () => {
		const environments = [
			env("explicit", ["p1"], "o/other"),
			env("primary", [], "O/REPO"),
			env("secondary", [], "o/other", "o/repo"),
			env("unrelated", ["p2"], "o/other"),
		];
		const { linked, other } = groupEnvironmentsForProject({
			environments,
			projectId: "p1",
			repositoryFullName: "o/repo",
		});
		expect(linked.map((row) => row.id)).toEqual(["explicit", "primary"]);
		expect(other.map((row) => row.id)).toEqual(["secondary", "unrelated"]);
	});

	it("puts everything in other without a project", () => {
		const environments = [env("a", ["p1"], "o/repo")];
		const { linked, other } = groupEnvironmentsForProject({
			environments,
			projectId: null,
			repositoryFullName: null,
		});
		expect(linked).toEqual([]);
		expect(other).toEqual(environments);
	});
});
