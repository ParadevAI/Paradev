import { parsePatchFiles } from "@pierre/diffs";
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

/**
 * Whether the text is a patch the patch view can show: it renders exactly one
 * file and throws on any other count, so a fence holding a whole `git diff`
 * goes to the plain code view instead.
 */
export function isSingleFilePatch(text: string): boolean {
	try {
		const patches = parsePatchFiles(text);
		if (patches.length !== 1) return false;
		const files = patches[0]?.files ?? [];
		return files.length === 1 && (files[0]?.hunks.length ?? 0) > 0;
	} catch {
		return false;
	}
}
