import { afterEach, describe, expect, test } from "bun:test";
import { withLocalHostService } from "../../../lib/host/test-helpers";
import createCommand from "./command";

let createInput: Record<string, unknown> | undefined;

withLocalHostService("org-1", {
	"project.create": (input) => {
		createInput = input;
		return { id: "project-1", name: input.name, repositories: [{}] };
	},
});

function invoke(options: Record<string, unknown>) {
	return createCommand.run({
		ctx: { api: {}, config: { organizationId: "org-1" }, bearer: "b" } as never,
		args: {} as never,
		options: { local: true, name: "Acme", ...options } as never,
		signal: new AbortController().signal,
	}) as Promise<{ data: Record<string, unknown>; message: string }>;
}

afterEach(() => {
	createInput = undefined;
});

describe("projects create --parent-dir", () => {
	test("is required to clone a URL", async () => {
		await expect(
			invoke({ repo: ["https://github.com/acme/web"] }),
		).rejects.toThrow("Cloning a --repo URL needs --parent-dir");
		expect(createInput).toBeUndefined();
	});

	test("is refused when every --repo is a local path", async () => {
		await expect(
			invoke({ repo: ["/src/web"], parentDir: "/src" }),
		).rejects.toThrow("--parent-dir is only used to clone a --repo URL");
		expect(createInput).toBeUndefined();
	});

	test("goes to the host with a clone beside a local path", async () => {
		await invoke({
			repo: ["/src/web", "git@github.com:acme/api.git"],
			parentDir: "/src",
		});
		expect(createInput).toEqual({
			name: "Acme",
			repositories: [
				{ kind: "local", path: "/src/web" },
				{ kind: "clone", url: "git@github.com:acme/api.git" },
			],
			parentDir: "/src",
		});
	});
});
