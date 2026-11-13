import { describe, expect, it } from "bun:test";
import { rootGitStatus } from "./rootGitStatus";

const status = (path: string) => ({
	againstBase: [],
	staged: [],
	unstaged: [{ path, oldPath: undefined as string | undefined }],
	ignoredPaths: ["dist/"],
});

describe("rootGitStatus", () => {
	it("leaves a single checkout's paths as they are", () => {
		const data = status("src/a.ts");
		expect(rootGitStatus([{ name: "api", data }])).toBe(data);
	});

	it("puts each checkout's paths under its folder", () => {
		const merged = rootGitStatus([
			{ name: "api", data: status("src/a.ts") },
			{ name: "web", data: status("index.ts") },
		]);
		expect(merged?.unstaged.map((file) => file.path)).toEqual([
			"api/src/a.ts",
			"web/index.ts",
		]);
		expect(merged?.ignoredPaths).toEqual(["api/dist/", "web/dist/"]);
	});

	it("is undefined until a checkout has loaded", () => {
		expect(
			rootGitStatus([
				{ name: "api", data: undefined },
				{ name: "web", data: undefined },
			]),
		).toBeUndefined();
	});
});
