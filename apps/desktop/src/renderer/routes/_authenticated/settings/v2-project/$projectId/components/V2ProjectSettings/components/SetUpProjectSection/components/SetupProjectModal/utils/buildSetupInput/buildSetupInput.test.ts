import { describe, expect, test } from "bun:test";
import { buildSetupInput } from "./buildSetupInput";

const project = {
	name: "Acme",
	primaryRepositoryId: "r-web",
	repositories: [
		{ id: "r-api", name: "api", url: "https://github.com/acme/api" },
		{ id: "r-web", name: "web", url: "https://github.com/acme/web" },
		{ id: "r-docs", name: "docs", url: null },
	],
};

describe("buildSetupInput", () => {
	test("clones into the one folder, and imports a folder of its own even at a new place", () => {
		const result = buildSetupInput({
			projectId: "p-1",
			project,
			parentDir: " /code ",
			choices: { "r-docs": { kind: "import", path: "/old/docs" } },
		});
		expect(result).toEqual({
			ok: true,
			input: {
				projectId: "p-1",
				origin: project,
				repositories: [
					{
						id: "r-api",
						mode: { kind: "clone", parentDir: "/code", allowRelocate: true },
					},
					{
						id: "r-web",
						mode: { kind: "clone", parentDir: "/code", allowRelocate: true },
					},
					{
						id: "r-docs",
						mode: { kind: "import", path: "/old/docs", allowRelocate: true },
					},
				],
			},
		});
	});

	test("names the repositories that still need a folder", () => {
		expect(
			buildSetupInput({
				projectId: "p-1",
				project,
				parentDir: "",
				choices: { "r-web": { kind: "import", path: "/code/web" } },
			}),
		).toEqual({ ok: false, missing: ["api", "docs"] });
	});
});
