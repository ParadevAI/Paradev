import { useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { type Editor, useEditorState } from "@tiptap/react";
import type { ReactNode } from "react";
import {
	LuBold,
	LuChevronDown,
	LuIndentDecrease,
	LuIndentIncrease,
	LuItalic,
	LuList,
	LuListOrdered,
	LuQuote,
	LuRedo2,
	LuRemoveFormatting,
	LuStrikethrough,
	LuUnderline,
	LuUndo2,
} from "react-icons/lu";
import { formatHotkeyDisplay } from "renderer/hotkeys/display";
import { PLATFORM } from "renderer/hotkeys/registry";
import {
	FONT_SIZES,
	type FontSizeName,
	gmailIndent,
	TEXT_COLORS,
} from "../../utils/gmailEditor";

interface FormattingBarProps {
	editor: Editor | null;
}

function keys(chord: string): string {
	return formatHotkeyDisplay(
		PLATFORM === "mac" ? chord : chord.replace("meta", "ctrl"),
		PLATFORM,
	).text;
}

function Tool({
	label,
	chord,
	active,
	onClick,
	children,
}: {
	label: string;
	chord?: string;
	active?: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<Tooltip delayDuration={400}>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					aria-pressed={active}
					onMouseDown={(event) => event.preventDefault()}
					onClick={onClick}
					className={cn(
						"flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground",
						active && "bg-fill-selected text-foreground",
					)}
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent side="top">
				{label}
				{chord && (
					<span className="ml-2 text-muted-foreground">{keys(chord)}</span>
				)}
			</TooltipContent>
		</Tooltip>
	);
}

const Divider = () => <span className="mx-0.5 h-4 w-px shrink-0 bg-border" />;

/** Gmail's formatting options row: undo, size, bold to underline, color, lists, indent, quote, strikethrough, remove formatting. */
export function FormattingBar({ editor }: FormattingBarProps) {
	const { t } = useLingui();
	const state = useEditorState({
		editor,
		selector: ({ editor: e }) => ({
			bold: e?.isActive("bold") ?? false,
			italic: e?.isActive("italic") ?? false,
			underline: e?.isActive("underline") ?? false,
			strike: e?.isActive("strike") ?? false,
			ordered: e?.isActive("orderedList") ?? false,
			bullet: e?.isActive("bulletList") ?? false,
			quote: e?.isActive("blockquote") ?? false,
			size:
				(e?.getAttributes("textStyle").fontSize as string | undefined) ?? null,
			color:
				(e?.getAttributes("textStyle").color as string | undefined) ?? null,
		}),
	});
	const run = (
		command: (
			chain: ReturnType<Editor["chain"]>,
		) => ReturnType<Editor["chain"]>,
	) => {
		if (!editor) return;
		command(editor.chain().focus()).run();
	};
	const indent = (by: 1 | -1) => {
		if (!editor) return;
		editor.commands.focus();
		gmailIndent(editor, by);
	};
	const sizeLabels: Record<FontSizeName, string> = {
		small: t({ message: "Small" }),
		normal: t({ message: "Normal" }),
		large: t({ message: "Large" }),
		huge: t({ message: "Huge" }),
	};
	const currentSize =
		(Object.entries(FONT_SIZES).find(([, css]) => css === state?.size)?.[0] as
			| FontSizeName
			| undefined) ?? "normal";
	return (
		<div
			role="toolbar"
			aria-label={t({ message: "Formatting options" })}
			className="mx-3 mt-1 flex flex-wrap items-center gap-0.5 rounded-md border border-border bg-background px-1 py-0.5 shadow-sm"
		>
			<Tool
				label={t({ message: "Undo" })}
				chord="meta+z"
				onClick={() => run((c) => c.undo())}
			>
				<LuUndo2 className="size-4" />
			</Tool>
			<Tool
				label={t({ message: "Redo" })}
				chord="meta+y"
				onClick={() => run((c) => c.redo())}
			>
				<LuRedo2 className="size-4" />
			</Tool>
			<Divider />
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						aria-label={t({ message: "Size" })}
						onMouseDown={(event) => event.preventDefault()}
						className="flex h-7 items-center gap-0.5 rounded px-1.5 text-[12px] text-muted-foreground hover:bg-fill-hover hover:text-foreground"
					>
						{sizeLabels[currentSize]}
						<LuChevronDown className="size-3" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-36">
					{(Object.keys(FONT_SIZES) as FontSizeName[]).map((name) => (
						<DropdownMenuItem
							key={name}
							onSelect={() =>
								run((c) => {
									const css = FONT_SIZES[name];
									return css ? c.setFontSize(css) : c.unsetFontSize();
								})
							}
						>
							<span
								style={
									FONT_SIZES[name] ? { fontSize: FONT_SIZES[name] } : undefined
								}
							>
								{sizeLabels[name]}
							</span>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
			<Divider />
			<Tool
				label={t({ message: "Bold" })}
				chord="meta+b"
				active={state?.bold}
				onClick={() => run((c) => c.toggleBold())}
			>
				<LuBold className="size-4" />
			</Tool>
			<Tool
				label={t({ message: "Italic" })}
				chord="meta+i"
				active={state?.italic}
				onClick={() => run((c) => c.toggleItalic())}
			>
				<LuItalic className="size-4" />
			</Tool>
			<Tool
				label={t({ message: "Underline" })}
				chord="meta+u"
				active={state?.underline}
				onClick={() => run((c) => c.toggleUnderline())}
			>
				<LuUnderline className="size-4" />
			</Tool>
			<Popover>
				<PopoverTrigger asChild>
					<button
						type="button"
						aria-label={t({ message: "Text color" })}
						onMouseDown={(event) => event.preventDefault()}
						className="flex h-7 items-center gap-0.5 rounded px-1 text-muted-foreground hover:bg-fill-hover hover:text-foreground"
					>
						<span className="flex size-4 flex-col items-center justify-center text-[13px] font-semibold leading-none">
							A
							<span
								className="mt-px h-0.5 w-3.5"
								style={{ background: state?.color ?? "currentColor" }}
							/>
						</span>
						<LuChevronDown className="size-3" />
					</button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-auto p-2">
					<div className="grid grid-cols-9 gap-1">
						{TEXT_COLORS.map((color) => (
							<button
								key={color}
								type="button"
								aria-label={color}
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => run((c) => c.setColor(color))}
								className={cn(
									"size-5 rounded-sm border border-border",
									state?.color === color && "ring-2 ring-ring",
								)}
								style={{ background: color }}
							/>
						))}
					</div>
					<button
						type="button"
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => run((c) => c.unsetColor())}
						className="mt-2 w-full rounded px-1 py-1 text-left text-[12px] text-muted-foreground hover:bg-fill-hover"
					>
						{t({ message: "Default color" })}
					</button>
				</PopoverContent>
			</Popover>
			<Divider />
			<Tool
				label={t({ message: "Numbered list" })}
				chord="meta+shift+7"
				active={state?.ordered}
				onClick={() => run((c) => c.toggleOrderedList())}
			>
				<LuListOrdered className="size-4" />
			</Tool>
			<Tool
				label={t({ message: "Bulleted list" })}
				chord="meta+shift+8"
				active={state?.bullet}
				onClick={() => run((c) => c.toggleBulletList())}
			>
				<LuList className="size-4" />
			</Tool>
			<Tool
				label={t({ message: "Indent less" })}
				chord="meta+["
				onClick={() => indent(-1)}
			>
				<LuIndentDecrease className="size-4" />
			</Tool>
			<Tool
				label={t({ message: "Indent more" })}
				chord="meta+]"
				onClick={() => indent(1)}
			>
				<LuIndentIncrease className="size-4" />
			</Tool>
			<Divider />
			<Tool
				label={t({ message: "Quote" })}
				chord="meta+shift+9"
				active={state?.quote}
				onClick={() => run((c) => c.toggleBlockquote())}
			>
				<LuQuote className="size-4" />
			</Tool>
			<Tool
				label={t({ message: "Strikethrough" })}
				chord="meta+shift+x"
				active={state?.strike}
				onClick={() => run((c) => c.toggleStrike())}
			>
				<LuStrikethrough className="size-4" />
			</Tool>
			<Tool
				label={t({ message: "Remove formatting" })}
				chord="meta+\\"
				onClick={() => run((c) => c.unsetAllMarks().clearNodes())}
			>
				<LuRemoveFormatting className="size-4" />
			</Tool>
		</div>
	);
}
