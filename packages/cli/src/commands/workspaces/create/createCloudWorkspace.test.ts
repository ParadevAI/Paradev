import { expect, test } from "bun:test";
import type { ApiClient } from "../../../lib/api-client";
import { createCloudWorkspace } from "./createCloudWorkspace";

test.each([
	"local",
	"worktree",
	"invalid",
])("rejects checkout %s before contacting cloud", async (checkout) => {
	let contacted = false;
	const api = new Proxy(
		{},
		{
			get() {
				contacted = true;
				throw new Error("Unexpected cloud request");
			},
		},
	) as ApiClient;
	await expect(
		createCloudWorkspace({ api, organizationId: "org", options: { checkout } }),
	).rejects.toThrow("--checkout does not apply to a cloud workspace");
	expect(contacted).toBe(false);
});

test("sends the chosen machine size to the cloud", async () => {
	let createInput: Record<string, unknown> | undefined;
	const api = {
		environment: {
			list: {
				query: async () => [
					{ id: "env-1", name: "main", repositories: [{ id: "repo-1" }] },
				],
			},
		},
		cloudWorkspace: {
			create: {
				mutate: async (input: Record<string, unknown>) => {
					createInput = input;
					return { id: "ws-1", branch: "main" };
				},
			},
		},
	} as unknown as ApiClient;
	await createCloudWorkspace({
		api,
		organizationId: "org",
		options: { machineSize: "small" },
	});
	expect(createInput).toMatchObject({ machineSize: "small" });
});
