import { describe, expect, test } from "bun:test";
import { withLocalHostService } from "../../../lib/host/test-helpers";
import listCommand from "./command";

withLocalHostService("org-1", {
	"project.list": () => [
		{
			id: "p-new",
			name: "orbit",
			repositories: [
				{ id: "r-api", name: "api", isPrimary: true },
				{ id: "r-web", name: "web", isPrimary: false },
			],
		},
		{ id: "p-old", name: "legacy", repoPath: "/src/legacy-repo" },
		{ id: "p-bare", name: "bare" },
	],
});

describe("projects list", () => {
	test("marks the primary, and lists a project from an older host without repositories", async () => {
		const result = await listCommand.run({
			ctx: { config: { organizationId: "org-1" }, bearer: "bearer" } as never,
			args: {} as never,
			options: { local: true } as never,
			signal: new AbortController().signal,
		});
		expect(result).toMatchObject([
			{ name: "bare", repos: "-", repositories: [] },
			{ name: "legacy", repos: "legacy-repo", repositories: [] },
			{ name: "orbit", repos: "api*, web" },
		]);
	});
});
