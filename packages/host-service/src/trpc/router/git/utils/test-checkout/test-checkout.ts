import {
	seedProject,
	seedPullRequest,
	seedWorkspace,
} from "../../../../../../test/helpers/seed";
import type { HostDb } from "../../../../../db";
import { createGitFactory } from "../../../../../runtime/git";
import type { HostServiceContext } from "../../../../../types";
import { createTestDb } from "../../../pull-requests/shared/test-db";

export interface TestCheckout {
	db: HostDb;
	workspaceId: string;
	repositoryId: string;
	pullRequestId: string | null;
}

/**
 * A real db holding one single-repo workspace at `worktreePath`, optionally
 * linked to a PR. Git router tests run against it instead of a stubbed db.
 */
export function seedTestCheckout(options: {
	workspaceId?: string;
	worktreePath?: string;
	pullRequest?: {
		repoOwner: string;
		repoName: string;
		prNumber?: number;
		headBranch?: string;
	};
	/** Leave the workspace out, for NOT_FOUND cases. */
	noWorkspace?: boolean;
}): TestCheckout {
	const db = createTestDb();
	const host = { db };
	const worktreePath = options.worktreePath ?? "/nonexistent/checkout";
	const { id: projectId, repositoryId } = seedProject(host, {
		repoPath: worktreePath,
	});
	const workspaceId = options.workspaceId ?? "ws";
	const pullRequestId = options.pullRequest
		? seedPullRequest(host, {
				repositoryId,
				repoOwner: options.pullRequest.repoOwner,
				repoName: options.pullRequest.repoName,
				prNumber: options.pullRequest.prNumber ?? 1,
				headBranch: options.pullRequest.headBranch ?? "main",
			}).id
		: null;
	if (!options.noWorkspace) {
		seedWorkspace(host, {
			id: workspaceId,
			projectId,
			worktreePath,
			branch: "main",
			pullRequestId,
		});
	}
	return { db, workspaceId, repositoryId, pullRequestId };
}

export function testGitContext(
	db: HostDb,
	overrides: Partial<Record<keyof HostServiceContext, unknown>> = {},
): HostServiceContext {
	const credentials = {
		// Worker git tasks see only this env; without PATH they cannot find git.
		getCredentials: async () => ({
			env: { PATH: process.env.PATH ?? "" },
		}),
		getToken: async () => null,
		credentialRemedy: () => "",
	};
	return {
		isAuthenticated: true,
		db,
		git: createGitFactory(credentials),
		credentials,
		...overrides,
	} as unknown as HostServiceContext;
}
