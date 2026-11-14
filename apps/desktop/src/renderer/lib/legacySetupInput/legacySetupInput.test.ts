import { describe, expect, test } from "bun:test";
import { legacySetupInput } from "./legacySetupInput";

describe("legacySetupInput", () => {
	test("places the folder as the one repository, whose id is the project id", () => {
		expect(
			legacySetupInput({
				candidate: {
					id: "p-1",
					name: "Acme",
					repoCloneUrl: "https://github.com/acme/web",
				},
				path: "/code/acme-web",
			}),
		).toEqual({
			projectId: "p-1",
			origin: {
				name: "Acme",
				primaryRepositoryId: "p-1",
				repositories: [
					{ id: "p-1", name: "web", url: "https://github.com/acme/web" },
				],
			},
			repositories: [
				{ id: "p-1", mode: { kind: "import", path: "/code/acme-web" } },
			],
		});
	});

	test("names a repository without a remote after its folder", () => {
		const input = legacySetupInput({
			candidate: { id: "p-1", name: "Acme", repoCloneUrl: null },
			path: "/code/acme-web",
			allowRelocate: true,
		});
		expect(input.origin?.repositories).toEqual([
			{ id: "p-1", name: "acme-web", url: null },
		]);
		expect(input.repositories[0]?.mode).toEqual({
			kind: "import",
			path: "/code/acme-web",
			allowRelocate: true,
		});
	});
});
