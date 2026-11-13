import { describe, expect, test } from "bun:test";
import { buildCreateProjectInput } from "./buildCreateProjectInput";

describe("buildCreateProjectInput", () => {
	test("local folders come first and lead as the primary", () => {
		expect(
			buildCreateProjectInput({
				name: " orbit ",
				repoPaths: ["/src/web"],
				cloneUrls: ["https://github.com/acme/api"],
				cloneDir: "/home/me/.paradev/projects/orbit",
			}),
		).toEqual({
			name: "orbit",
			repositories: [
				{ kind: "local", path: "/src/web" },
				{ kind: "clone", url: "https://github.com/acme/api" },
			],
			parentDir: "/home/me/.paradev/projects/orbit",
		});
	});

	test("sends no parentDir when nothing is cloned", () => {
		expect(
			buildCreateProjectInput({
				name: "web",
				repoPaths: ["/src/web"],
				cloneUrls: [],
				cloneDir: "/home/me/.paradev/projects/web",
			}),
		).toEqual({
			name: "web",
			repositories: [{ kind: "local", path: "/src/web" }],
		});
	});
});
