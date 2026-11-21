import { describe, expect, it } from "bun:test";
import { projectToLink } from "./projectToLink";

const MARTEN = { id: "p-marten", repositoryFullName: "ParadevAI/marten" };

describe("projectToLink", () => {
	it("links the project when the environment opens on its repository", () => {
		expect(projectToLink(MARTEN, "paradevai/Marten")).toBe("p-marten");
	});

	it("does not link a project to another repository's environment", () => {
		expect(projectToLink(MARTEN, "ParadevAI/roster")).toBeNull();
	});

	it("does not link a project without a repository", () => {
		expect(
			projectToLink(
				{ id: "p-1", repositoryFullName: null },
				"ParadevAI/roster",
			),
		).toBeNull();
	});
});
