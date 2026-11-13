import type { workspaceTrpc } from "@superset/workspace-client";
import { isDiffPatchQueryAffected } from "renderer/lib/diffPatchQuery";
import { checkoutInput } from "../../../../utils/checkoutInput";

type GitUtils = Pick<
	ReturnType<typeof workspaceTrpc.useUtils>["git"],
	"getDiffPatch" | "getDiff" | "getBaseBranch" | "listCommits"
>;

/** Drops one checkout's cached diffs after its `git:changed`; other checkouts keep theirs. */
export function invalidateCheckoutGitQueries(
	git: GitUtils,
	workspaceId: string,
	repositoryId: string | undefined,
	paths: string[] | undefined,
): void {
	const scope = checkoutInput(workspaceId, repositoryId);
	if (paths && paths.length > 0) {
		// Patch keys name what is diffed, not which files, so an edit to an
		// already-changed file leaves cached hunks behind.
		void git.getDiffPatch.invalidate(scope, {
			predicate: (query) => isDiffPatchQueryAffected(query, paths),
		});
		for (const path of paths) {
			void git.getDiff.invalidate({ ...scope, path });
		}
		return;
	}
	void git.getDiffPatch.invalidate(scope);
	void git.getDiff.invalidate(scope);
	void git.getBaseBranch.invalidate(scope);
	void git.listCommits.invalidate(scope);
}
