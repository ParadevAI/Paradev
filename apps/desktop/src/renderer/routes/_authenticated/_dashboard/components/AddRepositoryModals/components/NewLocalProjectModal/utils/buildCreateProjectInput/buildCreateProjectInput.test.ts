import { describe, expect, test } from "bun:test";
import { buildCreateProjectInput } from "./buildCreateProjectInput";

const web = { kind: "local" as const, path: "/src/web" };
const api = {
	kind: "clone" as const,
	url: "https://github.com/acme/api",
	label: "acme/api",
};

describe("buildCreateProjectInput", () => {
	test("the picked primary leads, the rest keep the order they were added in", () => {
		expect(
			buildCreateProjectInput({
				name: " orbit ",
				sources: [web, api],
				primaryKey: api.url,
				cloneDir: "/home/me/.paradev/projects/orbit",
			}),
		).toEqual({
			name: "orbit",
			repositories: [
				{ kind: "clone", url: "https://github.com/acme/api" },
				{ kind: "local", path: "/src/web" },
			],
			parentDir: "/home/me/.paradev/projects/orbit",
		});
	});

	test("sends no parentDir when nothing is cloned", () => {
		expect(
			buildCreateProjectInput({
				name: "web",
				sources: [web],
				primaryKey: undefined,
				cloneDir: "/home/me/.paradev/projects/web",
			}),
		).toEqual({
			name: "web",
			repositories: [{ kind: "local", path: "/src/web" }],
		});
	});
});
