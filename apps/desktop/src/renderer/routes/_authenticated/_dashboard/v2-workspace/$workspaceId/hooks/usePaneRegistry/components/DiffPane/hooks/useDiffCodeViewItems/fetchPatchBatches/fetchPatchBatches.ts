import type { GetDiffPatchInput } from "renderer/lib/diffPatchQuery";
import { boundPatch, MAX_PATCH_LENGTH } from "../boundPatch";
import { splitPatchInput } from "../splitPatchInput";

interface DiffPatchResponse {
	patch: string;
	truncated?: boolean;
}

export interface FetchedPatch {
	patch: string;
	whitespaceFilteredPaths: string[];
}

/**
 * Fetches a patch request in calls the host accepts, held to one response's
 * bound. `whitespaceFilteredPaths` lists the paths of each call that ignored
 * whitespace and arrived uncut. Null when whitespace is ignored but the host
 * cannot do it: a host without `truncated` drops `ignoreWhitespace`.
 */
export async function fetchPatchBatches(
	input: GetDiffPatchInput,
	query: (batch: GetDiffPatchInput) => Promise<DiffPatchResponse>,
	maxLength: number = MAX_PATCH_LENGTH,
): Promise<FetchedPatch | null> {
	const patches: string[] = [];
	const whitespaceFilteredPaths: string[] = [];
	let length = 0;
	for (const batch of splitPatchInput(input)) {
		if (length >= maxLength) break;
		const response = await query(batch);
		if (input.ignoreWhitespace && response.truncated === undefined) {
			return null;
		}
		patches.push(response.patch);
		length += response.patch.length;
		// `boundPatch` cuts only past `maxLength`.
		if (
			input.ignoreWhitespace &&
			response.truncated === false &&
			length <= maxLength
		) {
			whitespaceFilteredPaths.push(...(batch.paths ?? []));
		}
	}
	return {
		patch: boundPatch(patches.join(""), maxLength),
		whitespaceFilteredPaths,
	};
}
