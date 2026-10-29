import { type FileDiffMetadata, parsePatchFiles } from "@pierre/diffs";
import type { ReactNode } from "react";
import {
	isLocalPathText,
	pathFileName,
	stripLocation,
} from "../../../../utils/pathText";

const LANGUAGE_CLASS = /(?:^|\s)language-([^\s]+)/;
const LINE_RANGE_PATH = /^(\d+):\d+:(.+)$/;
const LANGUAGE_PATH = /^([\w+#-]+):(.+)$/;

/** The word after a fence's backticks as written, or null for an unmarked fence. */
export function fenceInfo(className: unknown): string | null {
	if (typeof className !== "string") return null;
	return LANGUAGE_CLASS.exec(className)?.[1] ?? null;
}

/** What a fenced block was marked as, or null for an unmarked fence. */
export function fenceLanguage(className: unknown): string | null {
	return fenceInfo(className)?.toLowerCase() ?? null;
}

export type FenceFile = {
	/** The path as the fence wrote it, without the language or line range. */
	path: string;
	fileName: string;
	/** The path with the line the fence starts at. */
	href: string;
};

export type Fence = {
	/** Null for an unmarked fence, and for a file fence that names no language. */
	language: string | null;
	file: FenceFile | null;
};

function fenceFile(path: string, startLine: string | null): FenceFile | null {
	const fileName = pathFileName(path);
	if (!fileName) return null;
	const hasLocation = stripLocation(path) !== path;
	return {
		path,
		fileName,
		href: hasLocation ? path : `${path}:${startLine ?? "1"}`,
	};
}

export function parseFence(info: string | null): Fence {
	if (info === null) return { language: null, file: null };
	if (isLocalPathText(info)) {
		const cited = LINE_RANGE_PATH.exec(info);
		const citedFile = cited
			? fenceFile(cited[2] ?? "", cited[1] ?? null)
			: null;
		if (citedFile) return { language: null, file: citedFile };

		const tagged = LANGUAGE_PATH.exec(info);
		const taggedFile = tagged ? fenceFile(tagged[2] ?? "", null) : null;
		if (tagged && taggedFile) {
			return { language: tagged[1]?.toLowerCase() ?? null, file: taggedFile };
		}

		const bare = fenceFile(info, null);
		// `makefile` and `dockerfile` are languages before they are file names.
		if (bare && bare.fileName !== info) return { language: null, file: bare };
		if (bare?.fileName.includes(".")) return { language: null, file: bare };
	}
	return { language: info.toLowerCase(), file: null };
}

/** The fence's text, without the newline markdown leaves at the end. */
export function fenceText(children: ReactNode): string {
	const collect = (node: ReactNode): string => {
		if (typeof node === "string") return node;
		if (typeof node === "number") return String(node);
		if (Array.isArray(node)) return node.map(collect).join("");
		return "";
	};
	return collect(children).replace(/\n$/, "");
}

const DIFF_LANGUAGES = new Set(["diff", "patch", "udiff"]);

export function isDiffLanguage(language: string | null): boolean {
	return language !== null && DIFF_LANGUAGES.has(language);
}

const GIT_DIFF_HEADER = /^diff --git /m;
const UNIFIED_SIDE_PREFIX = /^[ab]\//;

/** Headerless `---`/`+++` patches keep git's `a/`/`b/` prefixes in their names. */
function withoutSidePrefixes(file: FileDiffMetadata): FileDiffMetadata {
	const name = file.name.replace(UNIFIED_SIDE_PREFIX, "");
	const prevName = file.prevName?.replace(UNIFIED_SIDE_PREFIX, "");
	if (prevName === undefined || prevName !== name) {
		return { ...file, name, prevName };
	}
	return { ...file, name, prevName: undefined, type: "change" };
}

/** The files of a patch that changes at least one line, or none for other text. */
export function parsePatchFileDiffs(text: string): FileDiffMetadata[] {
	try {
		const files = parsePatchFiles(text).flatMap((patch) => patch.files);
		if (!files.some((file) => file.hunks.length > 0)) return [];
		return GIT_DIFF_HEADER.test(text) ? files : files.map(withoutSidePrefixes);
	} catch {
		return [];
	}
}
