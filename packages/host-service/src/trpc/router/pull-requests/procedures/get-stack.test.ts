import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUserSimpleGit } from "../../../../runtime/git/simple-git";
import type { HostServiceContext } from "../../../../types";
import { createCallerFactory, router } from "../../../index";
import type { StackRootPullRequest } from "../shared/pull-request-stack";
import { stackGraphql, stackNode } from "../shared/stack-test-github";
import {
	createTestDb,
	PR_NUMBER,
	PROJECT_ID,
	REPO,
	seedLinkedPullRequest,
	UNLINKED_PR_NUMBER,
} from "../shared/test-db";
import { getStack } from "./get-stack";

const tempDirs: string[] = [];
afterAll(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

async function createRepo(origin: string | null): Promise<string> {
	const dir = mkdtempSync(join(tmpdir(), "pr-stack-test-"));
	tempDirs.push(dir);
	const git = createUserSimpleGit(dir);
	await git.init();
	if (origin) await git.addRemote("origin", origin);
	return (await git.revparse(["--show-toplevel"])).trim();
}

const createCaller = createCallerFactory(router({ getStack }));

async function callerFor(
	root: StackRootPullRequest,
	open: ReturnType<typeof stackNode>[],
	origin: string | null = `https://github.com/${REPO.owner}/${REPO.name}.git`,
) {
	const db = createTestDb();
	seedLinkedPullRequest(db, await createRepo(origin));
	const ctx = {
		db,
		github: async () => ({ graphql: stackGraphql(root, open) }),
		isAuthenticated: true,
		organizationId: "org-test",
	} as unknown as HostServiceContext;
	return createCaller(ctx);
}

describe("pullRequests.getStack", () => {
	const bottom = stackNode(PR_NUMBER);
	const top = stackNode(UNLINKED_PR_NUMBER, {
		baseRefName: bottom.headRefName,
	});

	test("infers the chain and names each layer's workspace on this host", async () => {
		const caller = await callerFor(top, [bottom, top]);
		const stack = await caller.getStack({
			projectId: PROJECT_ID,
			prNumber: UNLINKED_PR_NUMBER,
		});
		expect(stack).toMatchObject({
			source: "inferred",
			baseRefName: "main",
			currentPosition: 2,
		});
		expect(
			stack?.layers.map((layer) => [layer.number, layer.workspaceId]),
		).toEqual([
			[PR_NUMBER, "ws-newer"],
			[UNLINKED_PR_NUMBER, null],
		]);
	});

	test("is null for a PR that stands alone", async () => {
		const caller = await callerFor(bottom, [bottom]);
		expect(
			await caller.getStack({ projectId: PROJECT_ID, prNumber: PR_NUMBER }),
		).toBeNull();
	});

	test("is null for a project with no GitHub remote", async () => {
		const caller = await callerFor(top, [bottom, top], null);
		expect(
			await caller.getStack({
				projectId: PROJECT_ID,
				prNumber: UNLINKED_PR_NUMBER,
			}),
		).toBeNull();
	});
});
