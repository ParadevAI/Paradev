import type { ComposerChip } from "@superset/chat-ui/PromptInput";
import { getFileIcon } from "renderer/lib/fileIcons";
import {
	RECENT_DISPLAY_LIMIT,
	type RecentFile,
} from "../../../../../useRecentlyViewedFiles";

export type FileMentionMatch = {
	absolutePath: string;
	relativePath: string;
	name: string;
};

function fileNameOf(path: string): string {
	return path.split("/").filter(Boolean).at(-1) ?? path;
}

/** The agent reads the path itself, so a file mention is sent as the path. */
export function fileMentionChip(relativePath: string, label?: string) {
	const name = fileNameOf(relativePath);
	return {
		label: label ?? name,
		serialized: relativePath,
		iconUrl: getFileIcon(name, false).src,
		data: { elementKind: "file_mention" },
	} satisfies ComposerChip;
}

export function fileMentionMatches(
	query: string,
	recentFiles: readonly RecentFile[],
	searchMatches: readonly FileMentionMatch[],
): FileMentionMatch[] {
	const needle = query.trim().toLowerCase();
	const recent = recentFiles
		.slice(0, RECENT_DISPLAY_LIMIT)
		.filter((file) => file.relativePath.toLowerCase().includes(needle))
		.map((file) => ({
			absolutePath: file.absolutePath,
			relativePath: file.relativePath,
			name: fileNameOf(file.relativePath),
		}));
	const recentPaths = new Set(recent.map((file) => file.absolutePath));
	return [
		...recent,
		...searchMatches.filter((match) => !recentPaths.has(match.absolutePath)),
	];
}
