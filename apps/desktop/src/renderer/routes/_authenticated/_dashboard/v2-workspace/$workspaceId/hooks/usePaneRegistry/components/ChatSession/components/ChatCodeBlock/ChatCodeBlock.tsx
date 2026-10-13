import { useLingui } from "@lingui/react/macro";
import { File, PatchDiff } from "@pierre/diffs/react";
import { cn } from "@superset/ui/utils";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { useMemo, useState } from "react";
import {
	getDiffsTheme,
	getDiffViewerStyle,
} from "renderer/screens/main/components/WorkspaceView/utils/code-theme";
import { useResolvedTheme } from "renderer/stores/theme";
import { CopyButton } from "../CopyButton";
import { FenceFilePath } from "./components/FenceFilePath";
import { FenceLanguage } from "./components/FenceLanguage";
import { WrapLinesButton } from "./components/WrapLinesButton";
import { CODE_CARD_CLASSNAME, FENCE_BUTTON_CLASSNAME } from "./constants";
import {
	fenceInfo,
	fenceText,
	isDiffLanguage,
	isSingleFilePatch,
	parseFence,
} from "./utils/fencedCode";

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

type FencedCodeProps = ComponentProps<"code"> & {
	node?: unknown;
	children?: ReactNode;
};

/**
 * A fenced block in agent prose, rendered by the same highlighter as the
 * diff card and the file viewer so code reads the same wherever it appears:
 * a quiet label, then the code on unwrapped lines that scroll sideways, with
 * a button to wrap them. A fence marked `diff` that is a real patch renders
 * as one, and a fence that names a file shows the file in place of the label.
 */
export function ChatCodeBlock({ children, className }: FencedCodeProps) {
	const { t } = useLingui();
	const activeTheme = useResolvedTheme();
	const [wrap, setWrap] = useState(false);
	const { language, file } = useMemo(
		() => parseFence(fenceInfo(className)),
		[className],
	);
	const text = useMemo(() => fenceText(children), [children]);
	const asPatch = useMemo(
		() => isDiffLanguage(language) && isSingleFilePatch(text),
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
	return (
		<div
			className={cn("mb-2 overflow-hidden", CODE_CARD_CLASSNAME)}
			data-chat-code-block={language ?? ""}
		>
			<div className="flex h-9 items-center justify-between gap-2 pr-1.5 pl-3">
				{file ? (
					<FenceFilePath file={file} />
				) : (
					<FenceLanguage language={language} />
				)}
				<div className="flex shrink-0 items-center gap-0.5">
					<WrapLinesButton onChange={setWrap} wrap={wrap} />
					<CopyButton
						className={FENCE_BUTTON_CLASSNAME}
						iconClassName="size-3.5"
						label={t({ message: "Copy code" })}
						text={text}
					/>
				</div>
			</div>
			{asPatch ? (
				<PatchDiff
					options={{ ...options, diffStyle: "unified", expandUnchanged: true }}
					patch={text}
					style={style}
				/>
			) : (
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
			)}
		</div>
	);
}
