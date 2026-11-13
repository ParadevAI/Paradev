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
		{ id: "p-old", name: "legacy" },
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
			{ name: "legacy", repos: "", repositories: [] },
			{ name: "orbit", repos: "api*, web" },
		]);
	});
});
