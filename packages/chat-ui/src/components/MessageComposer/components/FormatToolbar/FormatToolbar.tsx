"use client";

import { $createCodeNode } from "@lexical/code";
import {
	INSERT_ORDERED_LIST_COMMAND,
	INSERT_UNORDERED_LIST_COMMAND,
	REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createQuoteNode } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { useLingui } from "@lingui/react/macro";
import {
	$createParagraphNode,
	$getSelection,
	$isRangeSelection,
	COMMAND_PRIORITY_NORMAL,
	type ElementNode,
	FORMAT_TEXT_COMMAND,
	KEY_DOWN_COMMAND,
} from "lexical";
import {
	BoldIcon,
	CodeIcon,
	ItalicIcon,
	ListIcon,
	ListOrderedIcon,
	SquareCodeIcon,
	StrikethroughIcon,
	TextQuoteIcon,
} from "lucide-react";
import { useEffect } from "react";
import { IS_MAC, shortcutLabel } from "../../utils/shortcutLabel";
import { LinkButton } from "./components/LinkButton";
import { ToolbarButton } from "./components/ToolbarButton";
import { useFormatState } from "./hooks/useFormatState";

/** Slack's formatting tray: text styles, link, lists, then quote and code. */
export function FormatToolbar() {
	const { t } = useLingui();
	const [editor] = useLexicalComposerContext();
	const format = useFormatState();

	const setBlock = (create: () => ElementNode, isActive: boolean) =>
		editor.update(() => {
			const selection = $getSelection();
			if (!$isRangeSelection(selection)) return;
			const createBlock: () => ElementNode = isActive
				? $createParagraphNode
				: create;
			$setBlocksType(selection, createBlock);
		});
	const toggleList = (kind: "number" | "bullet") =>
		editor.dispatchCommand(
			format.list === kind
				? REMOVE_LIST_COMMAND
				: kind === "number"
					? INSERT_ORDERED_LIST_COMMAND
					: INSERT_UNORDERED_LIST_COMMAND,
			undefined,
		);
	const toggleQuote = () => setBlock($createQuoteNode, format.quote);
	const toggleCodeBlock = () =>
		setBlock(() => $createCodeNode(), format.codeBlock);

	// Slack's formatting keys, beyond the bold and italic keys the editor
	// already knows. The digit keys stay macOS-only: elsewhere Ctrl+Shift+digit
	// switches workspace.
	useEffect(() =>
		editor.registerCommand(
			KEY_DOWN_COMMAND,
			(event) => {
				if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) {
					return false;
				}
				const digits = IS_MAC
					? event.code === "Digit7"
						? () => toggleList("number")
						: event.code === "Digit8"
							? () => toggleList("bullet")
							: event.code === "Digit9"
								? toggleQuote
								: null
					: null;
				const action =
					event.code === "KeyX"
						? () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough")
						: event.code === "KeyC" && event.altKey
							? toggleCodeBlock
							: event.code === "KeyC"
								? () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code")
								: digits;
				if (!action) return false;
				event.preventDefault();
				event.stopPropagation();
				action();
				return true;
			},
			COMMAND_PRIORITY_NORMAL,
		),
	);
	const digitShortcut = (key: string) =>
		IS_MAC ? shortcutLabel(["mod", "shift"], key) : undefined;

	return (
		<div className="flex items-center gap-0.5 px-2 pt-2">
			<ToolbarButton
				label={t({ message: "Bold" })}
				shortcut={shortcutLabel(["mod"], "B")}
				active={format.bold}
				onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
			>
				<BoldIcon />
			</ToolbarButton>
			<ToolbarButton
				label={t({ message: "Italic" })}
				shortcut={shortcutLabel(["mod"], "I")}
				active={format.italic}
				onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
			>
				<ItalicIcon />
			</ToolbarButton>
			<ToolbarButton
				label={t({ message: "Strikethrough" })}
				shortcut={shortcutLabel(["mod", "shift"], "X")}
				active={format.strikethrough}
				onClick={() =>
					editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough")
				}
			>
				<StrikethroughIcon />
			</ToolbarButton>
			<div className="mx-1 h-4 w-px bg-border" />
			<LinkButton active={format.link} />
			<ToolbarButton
				label={t({ message: "Numbered list" })}
				shortcut={digitShortcut("7")}
				active={format.list === "number"}
				onClick={() => toggleList("number")}
			>
				<ListOrderedIcon />
			</ToolbarButton>
			<ToolbarButton
				label={t({ message: "Bulleted list" })}
				shortcut={digitShortcut("8")}
				active={format.list === "bullet"}
				onClick={() => toggleList("bullet")}
			>
				<ListIcon />
			</ToolbarButton>
			<div className="mx-1 h-4 w-px bg-border" />
			<ToolbarButton
				label={t({ message: "Quote" })}
				shortcut={digitShortcut("9")}
				active={format.quote}
				onClick={toggleQuote}
			>
				<TextQuoteIcon />
			</ToolbarButton>
			<ToolbarButton
				label={t({ message: "Code" })}
				shortcut={shortcutLabel(["mod", "shift"], "C")}
				active={format.code}
				onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code")}
			>
				<CodeIcon />
			</ToolbarButton>
			<ToolbarButton
				label={t({ message: "Code block" })}
				shortcut={shortcutLabel(["mod", "alt", "shift"], "C")}
				active={format.codeBlock}
				onClick={toggleCodeBlock}
			>
				<SquareCodeIcon />
			</ToolbarButton>
		</div>
	);
}
