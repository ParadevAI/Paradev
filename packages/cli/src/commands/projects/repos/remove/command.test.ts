import { afterEach, describe, expect, test } from "bun:test";
import { withLocalHostService } from "../../../../lib/host/test-helpers";
import removeCommand from "./command";

const PROJECT = {
	id: "project-1",
	name: "orbit",
	repositories: [
		{ id: "r-api", name: "api", isPrimary: true },
		{ id: "r-web", name: "web", isPrimary: false },
	],
};
let project: Record<string, unknown> = PROJECT;
let removeInput: Record<string, unknown> | undefined;

withLocalHostService("org-1", {
	"project.get": () => project,
	"project.removeRepository": (input) => {
		removeInput = input;
		return PROJECT;
	},
});

function invoke(repository: string) {
	return removeCommand.run({
		ctx: { config: { organizationId: "org-1" }, bearer: "bearer" } as never,
		args: { repository } as never,
		options: { local: true, project: "project-1" } as never,
		signal: new AbortController().signal,
	});
}

afterEach(() => {
	project = PROJECT;
	removeInput = undefined;
});

describe("projects repos remove", () => {
	test("removes the repository named in any case", async () => {
		const result = (await invoke("WEB")) as { message: string };
		expect(removeInput).toEqual({
			projectId: "project-1",
			repositoryId: "r-web",
		});
		expect(result.message).toBe("Removed web from orbit");
	});

	test("refuses an unknown repository, naming the project's", async () => {
		await expect(invoke("docs")).rejects.toThrow('has no repository "docs"');
		expect(removeInput).toBeUndefined();
	});

	test("says the host is too old when its project has no repositories", async () => {
		project = { id: "project-1", name: "orbit" };
		await expect(invoke("web")).rejects.toThrow("too old");
		expect(removeInput).toBeUndefined();
	});
});
