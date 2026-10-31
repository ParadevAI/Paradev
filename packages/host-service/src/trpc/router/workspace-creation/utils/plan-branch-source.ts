import { TRPCError } from "@trpc/server";
import { resolveRef } from "../../../../runtime/git/refs";
import type { BranchSourcePlan } from "../shared/add-branch-worktree";
import type { GitClient } from "../shared/types";
import {
	type BaseRefFetcher,
	resolveNewBranchStartPoint,
} from "./resolve-new-branch-start-point";

export async function planBranchSource(
	git: GitClient,
	branch: string,
	baseBranch: string | undefined,
	fetchRemoteRef?: BaseRefFetcher,
): Promise<BranchSourcePlan> {
	let resolved = await resolveRef(git, branch);

	// Branch search answers from cached refs, so a branch pushed since the
	// last fetch is not known yet. Fetch it before creating a new branch.
	if (!resolved && fetchRemoteRef) {
		const fetched = await fetchRemoteRef({
			remote: "origin",
			branch: branch.replace(/^origin\//, ""),
		}).then(
			() => true,
			() => false,
		);
		if (fetched) resolved = await resolveRef(git, branch);
	}

	if (
		resolved &&
		(resolved.kind === "local" || resolved.kind === "remote-tracking")
	) {
		// `shortName`, not the input: resolveRef may have adopted an existing
		// branch's canonical casing, and `-b <input-casing>` would mint a
		// case-twin sharing the same loose-ref file on case-insensitive disks.
		return {
			branch: resolved.shortName,
			startPoint: resolved,
			usedExistingBranch: true,
		};
	}

	if (resolved && resolved.kind === "tag") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `"${branch}" is a tag, not a branch — cannot check out into a workspace`,
		});
	}

	const startPoint = await resolveNewBranchStartPoint(
		git,
		baseBranch,
		fetchRemoteRef,
	);
	return { branch, startPoint, usedExistingBranch: false };
}
