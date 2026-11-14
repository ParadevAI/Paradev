import { beforeEach, expect, mock, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

type Input = {
	projectId?: string;
	hostId?: string;
	name?: string;
	checkout?: "local" | "worktree";
	branch?: string;
	pr?: number;
	baseBranch?: string;
	repository?: string;
};
let definition: {
	inputSchema: z.ZodRawShape;
	handler: (input: Input, ctx: object) => Promise<unknown>;
};
let request: { procedure: string; input: unknown } | undefined;
let hostProject: unknown = null;
mock.module("../../define-tool", () => ({
	defineTool: (_server: unknown, value: typeof definition) => {
		definition = value;
	},
}));
mock.module("../../host-service-client", () => ({
	HostServiceUnreachableError: class extends Error {},
	hostServiceCall: async (
		_ctx: unknown,
		procedure: string,
		_kind: string,
		input: unknown,
	) => {
		if (procedure === "project.get") return hostProject;
		request = { procedure, input };
		return {};
	},
}));
mock.module("../../caller", () => ({
	createMcpCaller: () => {
		throw new Error("Unexpected cloud request");
	},
}));
const { register } = await import("./create");
register({} as McpServer);
const input: Input = {
	hostId: "host",
	projectId: "9f1ca3e7-df91-43a1-bfa2-b4f9ac14aeb0",
	name: "local",
	checkout: "local",
};
beforeEach(() => {
	request = undefined;
	hostProject = null;
});
test("exposes local checkout and uses a procedure older hosts cannot silently reinterpret", async () => {
	const parsed = z.object(definition.inputSchema).parse(input) as Input;
	await definition.handler(parsed, {});
	expect(request?.procedure).toBe("workspaces.createLocal");
	expect(request?.input).toMatchObject({ checkout: "local" });
});
test("keeps ordinary worktrees on the existing endpoint", async () => {
	await definition.handler(
		{ ...input, checkout: undefined, branch: "feature" },
		{},
	);
	expect(request?.procedure).toBe("workspaces.create");
});
test.each([
	"branch",
	"pr",
	"baseBranch",
] as const)("rejects local plus %s before calling the host", async (field) => {
	await expect(
		definition.handler(
			{ ...input, [field]: field === "pr" ? 12 : "feature" },
			{},
		),
	).rejects.toThrow("cannot be combined");
	expect(request).toBeUndefined();
});
test("rejects checkout on sessions", async () => {
	await expect(
		definition.handler({ ...input, projectId: undefined }, {}),
	).rejects.toThrow("requires");
	expect(request).toBeUndefined();
});

const worktree = { ...input, checkout: undefined };
const multiRepoProject = {
	primaryRepositoryId: "repo-app",
	repositories: [
		{ id: "repo-app", name: "app" },
		{ id: "repo-docs", name: "docs" },
	],
};
test("sends pr and baseBranch as the primary repository's checkout, and the legacy fields for released hosts", async () => {
	hostProject = multiRepoProject;
	await definition.handler({ ...worktree, pr: 7, baseBranch: "main" }, {});
	expect(request?.input).toMatchObject({
		checkouts: { "repo-app": { pr: 7, baseBranch: "main" } },
		pr: 7,
		baseBranch: "main",
	});
});
test("puts the PR on the repository named by `repository`, in any case", async () => {
	hostProject = multiRepoProject;
	await definition.handler({ ...worktree, pr: 3, repository: "Docs" }, {});
	expect(request?.input).toMatchObject({
		checkouts: { "repo-docs": { pr: 3 } },
	});
});
test("rejects a repository the project does not have", async () => {
	hostProject = multiRepoProject;
	await expect(
		definition.handler({ ...worktree, pr: 3, repository: "nope" }, {}),
	).rejects.toThrow("Repositories: app, docs");
	expect(request).toBeUndefined();
});
test("a host without repositories gets only the legacy fields", async () => {
	hostProject = { id: input.projectId };
	await definition.handler({ ...worktree, pr: 7 }, {});
	expect(request?.input).toMatchObject({ pr: 7 });
	expect((request?.input as { checkouts?: unknown }).checkouts).toBeUndefined();
	await expect(
		definition.handler({ ...worktree, pr: 7, repository: "docs" }, {}),
	).rejects.toThrow("too old");
});
test("rejects branch plus pr on a one-repository project", async () => {
	hostProject = {
		primaryRepositoryId: "repo-app",
		repositories: [{ id: "repo-app", name: "app" }],
	};
	await expect(
		definition.handler({ ...worktree, branch: "feature", pr: 7 }, {}),
	).rejects.toThrow("cannot both be set");
	expect(request).toBeUndefined();
});
test("sends branch plus pr on a multi-repository project", async () => {
	hostProject = multiRepoProject;
	await definition.handler(
		{ ...worktree, branch: "feature", pr: 7, repository: "docs" },
		{},
	);
	expect(request?.input).toMatchObject({
		branch: "feature",
		checkouts: { "repo-docs": { pr: 7 } },
	});
});
