import { afterEach, describe, expect, test } from "bun:test";
import { withLocalHostService } from "../../../../lib/host/test-helpers";
import addCommand from "./command";

let addInput: Record<string, unknown> | undefined;

withLocalHostService("org-1", {
	"project.addRepository": (input) => {
		addInput = input;
		return {
			id: "project-1",
			name: "orbit",
			repositories: [
				{ id: "r-api", name: "api", isPrimary: true },
				{ id: "r-web", name: "web", isPrimary: false },
			],
		};
	},
});

function invoke(repo: string, options: { parentDir?: string } = {}) {
	return addCommand.run({
		ctx: { config: { organizationId: "org-1" }, bearer: "bearer" } as never,
		args: { repo } as never,
		options: { local: true, project: "project-1", ...options } as never,
		signal: new AbortController().signal,
	});
}

afterEach(() => {
	addInput = undefined;
});

describe("projects repos add", () => {
	test("adds a local path where it is", async () => {
		const result = (await invoke("/src/web")) as { message: string };
		expect(addInput).toEqual({
			projectId: "project-1",
			source: { kind: "local", path: "/src/web" },
		});
		expect(result.message).toBe("Project orbit now has: api, web");
	});

	test("clones a URL into --parent-dir", async () => {
		await invoke("github.com:o/web", { parentDir: "/src" });
		expect(addInput).toEqual({
			projectId: "project-1",
			source: { kind: "clone", url: "github.com:o/web" },
			parentDir: "/src",
		});
	});

	test("refuses a URL without --parent-dir, and --parent-dir with a path", async () => {
		await expect(invoke("git@github.com:o/web.git")).rejects.toThrow(
			"--parent-dir",
		);
		await expect(invoke("/src/web", { parentDir: "/src" })).rejects.toThrow(
			"applies to a cloned URL",
		);
		expect(addInput).toBeUndefined();
	});
});
