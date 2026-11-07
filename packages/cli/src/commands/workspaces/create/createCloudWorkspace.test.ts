import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApiClient } from "../../../lib/api-client";
import { workspaceLinks } from "../../../lib/open-url";
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

function recordingApi() {
	const calls: { createInput?: Record<string, unknown> } = {};
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
					calls.createInput = input;
					return { id: "ws-1", branch: "main" };
				},
			},
		},
	} as unknown as ApiClient;
	return { api, calls };
}

test("sends the chosen machine size to the cloud", async () => {
	const { api, calls } = recordingApi();
	await createCloudWorkspace({
		api,
		organizationId: "org",
		options: { machineSize: "small" },
	});
	expect(calls.createInput).toMatchObject({ machineSize: "small" });
});

test("sends --base-branch as the branch the cloud workspace starts from", async () => {
	const { api, calls } = recordingApi();
	await createCloudWorkspace({
		api,
		organizationId: "org",
		options: { baseBranch: "main" },
	});
	expect(calls.createInput).toMatchObject({ branch: "main" });
});

test("returns the cloud workspace's desktop and web links", async () => {
	const { api } = recordingApi();
	const result = await createCloudWorkspace({
		api,
		organizationId: "org",
		options: {},
	});
	expect(result.data).toMatchObject({ id: "ws-1", ...workspaceLinks("ws-1") });
});

test("uploads --attachment files and hands their ids to the agent", async () => {
	const { api, calls } = recordingApi();
	const dir = mkdtempSync(join(tmpdir(), "cloud-create-"));
	const path = join(dir, "brief.md");
	writeFileSync(path, "# brief");
	const withUploads = {
		...api,
		attachment: {
			createUpload: {
				mutate: async () => ({
					fileId: "file-1",
					upload: { url: "https://storage.test/put", headers: {} },
				}),
			},
		},
	} as unknown as ApiClient;
	const fetchImpl = (async () =>
		new Response(null, { status: 200 })) as unknown as typeof fetch;
	await createCloudWorkspace({
		api: withUploads,
		organizationId: "org",
		options: { agent: "claude", prompt: "Read the brief", attachment: [path] },
		fetchImpl,
	});
	rmSync(dir, { recursive: true, force: true });
	expect(calls.createInput).toMatchObject({
		agent: "claude",
		attachmentFileIds: ["file-1"],
	});
});

test("rejects --attachment without --agent before contacting cloud", async () => {
	const { api, calls } = recordingApi();
	await expect(
		createCloudWorkspace({
			api,
			organizationId: "org",
			options: { attachment: ["brief.md"] },
		}),
	).rejects.toThrow("--attachment requires --agent");
	expect(calls.createInput).toBeUndefined();
});
