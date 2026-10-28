import {
	type FileDiffMetadata,
	parseDiffFromFile,
	parsePatchFiles,
} from "@pierre/diffs";
import { buildContentKey } from "renderer/routes/_authenticated/_dashboard/utils/buildContentKey";
import type { ChangesetFile } from "../../../../../../useChangeset";

export interface PatchGroupFile {
	path: string;
	oldPath?: string;
	oldFile: { name: string; contents: string };
	newFile: { name: string; contents: string };
}

/** `files` is the fallback for a host without `git.getDiffPatch`.
 * `requestedPaths` is what was asked for, not what came back;
 * `requestedUntrackedPaths` is the subset sent as `untrackedPaths`.
 * `whitespaceFiltered` is set only when whitespace was ignored and nothing
 * was cut, so a tracked file without a section changed only in whitespace. */
export type PatchGroupResult = {
	requestedPaths: string[];
	requestedUntrackedPaths: string[];
	whitespaceFiltered: boolean;
} & (
	| { kind: "patch"; patch: string }
	| { kind: "files"; files: PatchGroupFile[] }
);

export interface ParsedPatchGroup {
	source: PatchGroupResult;
	byPath: ReadonlyMap<string, FileDiffMetadata>;
	bySegmentKey: ReadonlyMap<string, FileDiffMetadata>;
}

/** Whether a requested file without a section was left out for changing only
 * in whitespace. Untracked files always get a section, and a file with no
 * line changes (a mode-only edit) is not a whitespace change. */
export function isWhitespaceOnly(
	result: PatchGroupResult,
	file: Pick<ChangesetFile, "status" | "additions" | "deletions">,
): boolean {
	return (
		result.whitespaceFiltered &&
		file.status !== "untracked" &&
		(file.additions ?? 0) + (file.deletions ?? 0) > 0
	);
}

const SEGMENT_BOUNDARY = /^diff --git /gm;

export function splitPatchSegments(patch: string): string[] {
	const starts: number[] = [];
	for (const match of patch.matchAll(SEGMENT_BOUNDARY)) {
		starts.push(match.index);
	}
	if (starts.length <= 1) return patch.length > 0 ? [patch] : [];
	const segments: string[] = [];
	let start = 0;
	for (const boundary of starts.slice(1)) {
		segments.push(patch.slice(start, boundary));
		start = boundary;
	}
	segments.push(patch.slice(start));
	return segments;
}

export function parsePatchGroup(
	groupKey: string,
	result: PatchGroupResult,
	previous?: ParsedPatchGroup,
	{ ignoreWhitespace = false }: { ignoreWhitespace?: boolean } = {},
): ParsedPatchGroup {
	const byPath = new Map<string, FileDiffMetadata>();
	const bySegmentKey = new Map<string, FileDiffMetadata>();
	const keep = (key: string, parse: () => FileDiffMetadata | undefined) => {
		const fileDiff = previous?.bySegmentKey.get(key) ?? parse();
		if (!fileDiff) return;
		bySegmentKey.set(key, fileDiff);
		byPath.set(fileDiff.name, fileDiff);
		if (fileDiff.prevName) byPath.set(fileDiff.prevName, fileDiff);
	};

	if (result.kind === "patch") {
		for (const segment of splitPatchSegments(result.patch)) {
			const key = buildContentKey(groupKey, segment);
			keep(key, () => parsePatchFiles(segment, key)[0]?.files[0]);
		}
	} else {
		for (const file of result.files) {
			const oldName = file.oldPath ?? file.path;
			const key = buildContentKey(
				groupKey,
				[oldName, file.oldFile.contents, file.path, file.newFile.contents].join(
					"\0",
				),
			);
			keep(key, () => {
				const fileDiff = parseDiffFromFile(
					{ ...file.oldFile, name: oldName, cacheKey: `${key}:old` },
					{ ...file.newFile, name: file.path, cacheKey: `${key}:new` },
					{ ignoreWhitespace },
				);
				// Same result as `git diff --ignore-all-space`: no section. Equal
				// contents are a mode-only change, which keeps its item.
				const whitespaceOnly =
					ignoreWhitespace &&
					fileDiff.hunks.length === 0 &&
					file.oldFile.contents !== file.newFile.contents;
				return whitespaceOnly ? undefined : fileDiff;
			});
		}
	}

	return { source: result, byPath, bySegmentKey };
}
