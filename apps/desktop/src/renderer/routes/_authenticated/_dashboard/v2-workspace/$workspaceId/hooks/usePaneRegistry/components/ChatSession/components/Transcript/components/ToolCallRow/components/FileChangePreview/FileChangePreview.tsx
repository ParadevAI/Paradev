import { useLingui } from "@lingui/react/macro";
import type { ToolCall, ToolContent } from "@superset/chat/protocol";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { cn } from "@superset/ui/utils";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { FileIcon } from "renderer/lib/fileIcons";
import { DiffStatText } from "../../../../../../../../../../components/DiffStatText";
import {
	diffPreviewLines,
	type PreviewLine,
} from "../../../../utils/diffPreview";
import type { DiffStats } from "../../../../utils/diffStats";
import { directoryOf, type FileChange } from "../../../../utils/fileChange";
import { TruncateStart } from "../../../TruncateStart";

const OPEN_DELAY_MS = 300;
const CLOSE_DELAY_MS = 180;

const TONES = {
	add: { row: "bg-green-400/10", bar: "bg-green-400", mark: "text-green-400" },
	del: { row: "bg-red-400/10", bar: "bg-red-400", mark: "text-red-400" },
	context: null,
} as const;

const MARKS = { add: "+", del: "−", context: " " } as const;

function PreviewLineRow({ line }: { line: PreviewLine }) {
	const tone = TONES[line.kind];
	return (
		<div
			className={cn(
				"relative flex w-max min-w-full items-baseline font-mono text-[11px] leading-[18px]",
				tone?.row,
			)}
			data-preview-line={line.kind}
		>
			{tone && (
				<span className={cn("absolute inset-y-0 left-0 w-0.5", tone.bar)} />
			)}
			<span className="w-8 shrink-0 pr-1.5 text-right text-[10px] text-foreground/35 tabular-nums">
				{line.number}
			</span>
			<span
				className={cn(
					"w-3 shrink-0 text-center font-bold",
					tone?.mark ?? "text-transparent",
				)}
			>
				{MARKS[line.kind]}
			</span>
			<span
				className={cn(
					"whitespace-pre pr-3",
					line.kind === "context" ? "text-foreground/55" : "text-foreground/80",
				)}
			>
				{line.text}
			</span>
		</div>
	);
}

/** Mounted with the card, so a row that is never hovered never diffs. */
function PreviewLines({
	content,
}: {
	content: Extract<ToolContent, { type: "diff" }>;
}) {
	const lines = useMemo(() => diffPreviewLines(content), [content]);
	if (!lines || lines.length === 0) return null;
	return (
		<div className="max-h-[180px] overflow-auto overscroll-contain border-border/60 border-t py-1">
			{lines.map((line) => (
				<PreviewLineRow key={`${line.kind}:${line.number}`} line={line} />
			))}
		</div>
	);
}

/**
 * The file chip of an edit row, and the card that opens on hover or focus
 * to show the edit itself: the file, what it cost, and its first changed
 * lines, without opening the row.
 */
export function FileChangePreview({
	change,
	children,
	closeDelay = CLOSE_DELAY_MS,
	content,
	onClick,
	openDelay = OPEN_DELAY_MS,
	stats,
	status,
}: {
	change: FileChange;
	content: Extract<ToolContent, { type: "diff" }>;
	status: ToolCall["status"];
	stats: DiffStats | null;
	onClick?: (() => void) | undefined;
	openDelay?: number;
	closeDelay?: number;
	children: ReactNode;
}) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const pointerDown = useRef(false);
	const directory = directoryOf(change.path, change.name);
	const attempted =
		status === "failed" || status === "declined" || status === "canceled";
	return (
		<HoverCard
			closeDelay={closeDelay}
			onOpenChange={setOpen}
			open={open}
			openDelay={openDelay}
		>
			<HoverCardTrigger asChild>
				<button
					className="pointer-events-auto min-w-0 cursor-pointer truncate rounded bg-foreground/[0.06] px-1 py-0.5 text-left font-mono text-[13px] text-foreground/70 transition-colors hover:bg-foreground/[0.12] hover:text-foreground/90"
					onBlur={() => {
						pointerDown.current = false;
					}}
					onClick={() => {
						// The row opens under the pointer, so the glance gives way to it.
						pointerDown.current = false;
						setOpen(false);
						onClick?.();
					}}
					onFocus={(event) => {
						// Only a keyboard focus opens the card; a click's focus would
						// reopen it over the row it just opened.
						if (pointerDown.current) event.preventDefault();
						pointerDown.current = false;
					}}
					onPointerDown={() => {
						pointerDown.current = true;
					}}
					title={change.path}
					type="button"
				>
					{children}
				</button>
			</HoverCardTrigger>
			<HoverCardContent
				align="start"
				className="w-[460px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border-foreground/[0.08] p-0 shadow-xl"
				sideOffset={6}
			>
				<div className="border-border/60 border-b px-2.5 py-1.5 font-sans text-[11px] text-foreground/50">
					{attempted
						? t({ message: "Attempted changes" })
						: t({ message: "Change preview" })}
				</div>
				<div className="flex min-w-0 items-center gap-1.5 px-2.5 py-2 text-xs">
					<FileIcon className="size-4 shrink-0" fileName={change.name} />
					<span className="shrink-0 font-medium font-mono text-foreground">
						{change.name}
					</span>
					{directory && (
						<TruncateStart
							className="font-mono text-muted-foreground/60"
							title={change.path}
						>
							{directory}
						</TruncateStart>
					)}
					{stats && (
						<span className="ml-auto shrink-0 whitespace-nowrap font-mono tabular-nums">
							<DiffStatText
								additions={stats.additions}
								deletions={stats.deletions}
							/>
						</span>
					)}
				</div>
				<PreviewLines content={content} />
			</HoverCardContent>
		</HoverCard>
	);
}
