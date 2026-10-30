import { File, FileDiff } from "@pierre/diffs/react";
import type { CSSProperties } from "react";
import { useMemo } from "react";
import {
	getDiffsTheme,
	getDiffViewerStyle,
} from "renderer/screens/main/components/WorkspaceView/utils/code-theme";
import { useResolvedTheme } from "renderer/stores/theme";
import {
	type Fence,
	isDiffLanguage,
	parsePatchFileDiffs,
} from "../../utils/fencedCode";

const CHAT_CODE_FONT_SIZE = 12;
const CHAT_CODE_LINE_HEIGHT = "20px";
/** The header's `pl-3`, so the code starts under the label. */
const CHAT_CODE_INSET = "12px";

/**
 * The renderer's shadow tree does not inherit the transcript's opt-in to
 * selection, and it insets a line by one character where the header is
 * inset by `CHAT_CODE_INSET`.
 */
const BLOCK_CSS = `
	* { user-select: text; -webkit-user-select: text; }
	pre[data-file] [data-line] { padding-inline: ${CHAT_CODE_INSET}; }
`;

/**
 * A fence's text, rendered by the same highlighter as the diff card and the
 * file viewer so code reads the same wherever it appears: unwrapped lines
 * that scroll sideways until asked to wrap. A fence marked `diff` that is a
 * real patch renders as one diff per file.
 */
export function FenceCode({
	fence,
	text,
	wrap,
}: {
	fence: Fence;
	text: string;
	wrap: boolean;
}) {
	const activeTheme = useResolvedTheme();
	const { language, file } = fence;
	const patchFiles = useMemo(
		() => (isDiffLanguage(language) ? parsePatchFileDiffs(text) : []),
		[language, text],
	);
	const style = {
		...getDiffViewerStyle(activeTheme, { fontSize: CHAT_CODE_FONT_SIZE }),
		"--diffs-line-height": CHAT_CODE_LINE_HEIGHT,
		"--diffs-bg": "transparent",
		"--diffs-bg-context-override": "transparent",
		backgroundColor: "transparent",
	} as CSSProperties;
	const options = {
		theme: getDiffsTheme(activeTheme),
		themeType: activeTheme.type,
		overflow: wrap ? ("wrap" as const) : ("scroll" as const),
		disableFileHeader: true,
		unsafeCSS: BLOCK_CSS,
	};
	if (patchFiles.length > 0) {
		return patchFiles.map((fileDiff, index) => (
			<FileDiff
				key={`${index}:${fileDiff.name}`}
				fileDiff={fileDiff}
				options={{
					...options,
					diffStyle: "unified",
					disableFileHeader: patchFiles.length === 1,
				}}
				style={style}
			/>
		));
	}
	return (
		<File
			file={
				file && !language
					? { name: file.fileName, contents: text }
					: {
							name: `snippet.${language ?? "txt"}`,
							contents: text,
							lang: language ?? "text",
						}
			}
			options={{ ...options, disableLineNumbers: true }}
			style={style}
		/>
	);
}
