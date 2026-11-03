import type { GetDiffPatchInput } from "renderer/lib/diffPatchQuery";

/** Host-service rejects a getDiffPatch call with more paths than this in
 * either list (`MAX_DIFF_BULK_PATHS`). */
export const MAX_PATCH_REQUEST_PATHS = 2000;

/**
 * Splits a patch request into calls the host accepts. Each call takes up to
 * the limit from both lists. A call with untracked paths only must not send an
 * empty `paths`: the host reads that as the whole category, so every call
 * would repeat the tracked diff. It sends one of its untracked paths instead,
 * which `git diff` matches with nothing. `:(literal)` keeps a name like
 * `[id].tsx` or `*` from matching tracked files as a glob.
 */
export function splitPatchInput(input: GetDiffPatchInput): GetDiffPatchInput[] {
	const paths = input.paths ?? [];
	const untrackedPaths = input.untrackedPaths ?? [];
	if (
		paths.length <= MAX_PATCH_REQUEST_PATHS &&
		untrackedPaths.length <= MAX_PATCH_REQUEST_PATHS
	) {
		return [input];
	}
	const count = Math.ceil(
		Math.max(paths.length, untrackedPaths.length) / MAX_PATCH_REQUEST_PATHS,
	);
	return Array.from({ length: count }, (_, index) => {
		const start = index * MAX_PATCH_REQUEST_PATHS;
		const end = start + MAX_PATCH_REQUEST_PATHS;
		const batchPaths = paths.slice(start, end);
		const batchUntracked = untrackedPaths.slice(start, end);
		return {
			...input,
			paths:
				batchPaths.length > 0 ? batchPaths : [`:(literal)${batchUntracked[0]}`],
			untrackedPaths: batchUntracked,
		};
	});
}
