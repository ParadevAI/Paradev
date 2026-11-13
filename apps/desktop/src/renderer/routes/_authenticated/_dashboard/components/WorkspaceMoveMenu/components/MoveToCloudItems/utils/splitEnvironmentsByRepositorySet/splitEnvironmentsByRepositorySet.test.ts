import { describe, expect, it } from "bun:test";
import { splitEnvironmentsByRepositorySet } from "./splitEnvironmentsByRepositorySet";

const environment = (id: string, names: string[]) => ({
	id,
	repositories: names.map((fullName) => ({ fullName })),
});

describe("splitEnvironmentsByRepositorySet", () => {
	it("keeps only environments that open the exact repository set", () => {
		const { matching, nonMatching } = splitEnvironmentsByRepositorySet({
			environments: [
				environment("web-only", ["acme/web"]),
				environment("both", ["Acme/Docs", "acme/web"]),
				environment("extra", ["acme/web", "acme/docs", "acme/api"]),
			],
			repositoryFullNames: ["acme/web", "acme/docs"],
		});
		expect(matching.map((row) => row.id)).toEqual(["both"]);
		expect(nonMatching.map((row) => row.id)).toEqual(["web-only", "extra"]);
	});
});
