import path from "node:path";
import { isPathWithinRoot, toRelativePath } from "./paths";
import { getSearchIndex } from "./search";

export interface FileReferenceMatch {
	absolutePath: string;
	relativePath: string;
	name: string;
}

interface FileReferenceHint {
	segments: string[];
	/** Points outside the root, so only a file its tail spells out in full can match. */
	foreign: boolean;
}

function toHint(reference: string, rootPath: string): FileReferenceHint | null {
	let value = reference.trim().replace(/\\/g, "/");
	let foreign = value.startsWith("~/");
	if (path.isAbsolute(value)) {
		if (isPathWithinRoot(rootPath, value)) {
			value = toRelativePath(rootPath, value).replace(/\\/g, "/");
		} else {
			foreign = true;
		}
	}
	const segments = value
		.split("/")
		.filter(
			(segment, index) => segment !== "" && !(index === 0 && segment === "~"),
		)
		.filter((segment) => segment !== "." && segment !== "..");
	return segments.length > 0 ? { segments, foreign } : null;
}

function sharedTailLength(a: readonly string[], b: readonly string[]): number {
	let shared = 0;
	while (
		shared < a.length &&
		shared < b.length &&
		a[a.length - 1 - shared] === b[b.length - 1 - shared]
	) {
		shared++;
	}
	return shared;
}

/**
 * The file a shortened or misplaced reference most plausibly means: the one
 * whose path shares the longest tail with it. Ties go to a preferred path,
 * most preferred first, then to the shortest path.
 */
export function pickFileReference<File extends FileReferenceMatch>(
	files: readonly File[],
	reference: string,
	rootPath: string,
	preferredRelativePaths: readonly string[] = [],
): File | null {
	const hint = toHint(reference, rootPath);
	if (!hint) return null;
	const name = hint.segments.at(-1);
	const exactPath = hint.segments.join("/");

	let best: File[] = [];
	let bestShared = 0;
	for (const file of files) {
		if (file.name !== name) continue;
		if (!hint.foreign && file.relativePath === exactPath) return file;
		const segments = file.relativePath.split("/");
		const shared = sharedTailLength(hint.segments, segments);
		if (hint.foreign && shared < segments.length) continue;
		if (shared > bestShared) {
			best = [file];
			bestShared = shared;
		} else if (shared === bestShared) {
			best.push(file);
		}
	}
	if (best.length <= 1) return best[0] ?? null;

	const byPath = new Map(best.map((file) => [file.relativePath, file]));
	for (const preferred of preferredRelativePaths) {
		const file = byPath.get(preferred);
		if (file) return file;
	}
	return (
		best.sort(
			(a, b) =>
				a.relativePath.length - b.relativePath.length ||
				a.relativePath.localeCompare(b.relativePath),
		)[0] ?? null
	);
}

export async function resolveFileReference({
	rootPath,
	reference,
	preferredRelativePaths,
}: {
	rootPath: string;
	reference: string;
	preferredRelativePaths?: readonly string[];
}): Promise<FileReferenceMatch | null> {
	const files = await getSearchIndex({ rootPath, includeHidden: false });
	return pickFileReference(files, reference, rootPath, preferredRelativePaths);
}
