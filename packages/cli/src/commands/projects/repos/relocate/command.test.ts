import { describe, expect, test } from "bun:test";
import { withLocalHostService } from "../../../../lib/host/test-helpers";
import relocateCommand from "./command";

const PROJECT = {
	id: "project-1",
	name: "orbit",
	repositories: [{ id: "r-api", name: "api", isPrimary: true }],
};
let relocateInput: Record<string, unknown> | undefined;

withLocalHostService("org-1", {
	"project.get": () => PROJECT,
	"project.relocateRepository": (input) => {
		relocateInput = input;
		return PROJECT;
	},
});

describe("projects repos relocate", () => {
	test("sends the repository and its new folder", async () => {
		const result = (await relocateCommand.run({
			ctx: { config: { organizationId: "org-1" }, bearer: "bearer" } as never,
			args: { repository: "api" } as never,
			options: {
				local: true,
				project: "project-1",
				path: "/moved/api",
			} as never,
			signal: new AbortController().signal,
		})) as { message: string };
		expect(relocateInput).toEqual({
			projectId: "project-1",
			repositoryId: "r-api",
			path: "/moved/api",
		});
		expect(result.message).toBe("api is now at /moved/api");
	});
});
