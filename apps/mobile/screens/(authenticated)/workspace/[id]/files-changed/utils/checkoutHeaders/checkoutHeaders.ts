import type { ChangesetFile } from "../../../hooks/useWorkspaceChangeset";

export interface CheckoutHeader {
	name: string;
	additions: number;
	deletions: number;
	fileCount: number;
}

/**
 * The repository header that goes before each checkout's first file, keyed by
 * that file's path. Empty when the workspace has one checkout.
 */
export function checkoutHeaders(
	files: Pick<
		ChangesetFile,
		"path" | "checkoutName" | "additions" | "deletions"
	>[],
): Map<string, CheckoutHeader> {
	const headers = new Map<string, CheckoutHeader>();
	let current = null as CheckoutHeader | null;
	for (const file of files) {
		if (file.checkoutName === null) continue;
		if (current?.name !== file.checkoutName) {
			current = {
				name: file.checkoutName,
				additions: 0,
				deletions: 0,
				fileCount: 0,
			};
			headers.set(file.path, current);
		}
		current.additions += file.additions ?? 0;
		current.deletions += file.deletions ?? 0;
		current.fileCount += 1;
	}
	return headers;
}
