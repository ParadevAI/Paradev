import { describe, expect, test } from "bun:test";
import { withLocalHostService } from "../../../../lib/host/test-helpers";
import primaryCommand from "./command";

const PROJECT = {
	id: "project-1",
	name: "orbit",
	repositories: [
		{ id: "r-api", name: "api", isPrimary: true },
		{ id: "r-web", name: "web", isPrimary: false },
	],
};
let primaryInput: Record<string, unknown> | undefined;

withLocalHostService("org-1", {
	"project.get": () => PROJECT,
	"project.setPrimaryRepository": (input) => {
		primaryInput = input;
		return PROJECT;
	},
});

describe("projects repos primary", () => {
	test("makes the repository named by id the primary", async () => {
		const result = (await primaryCommand.run({
			ctx: { config: { organizationId: "org-1" }, bearer: "bearer" } as never,
			args: { repository: "r-web" } as never,
			options: { local: true, project: "project-1" } as never,
			signal: new AbortController().signal,
		})) as { message: string };
		expect(primaryInput).toEqual({
			projectId: "project-1",
			repositoryId: "r-web",
		});
		expect(result.message).toBe("web is now the primary repository of orbit");
	});
});
