"use client";

import { cn } from "@superset/ui/utils";
import {
	FileArchiveIcon,
	FileCode2Icon,
	FileJson2Icon,
	FileTextIcon,
	ImageIcon,
	Music2Icon,
} from "lucide-react";
import type { JSX } from "react";

const CODE_EXTENSIONS = new Set([
	"ts",
	"tsx",
	"js",
	"jsx",
	"py",
	"rs",
	"go",
	"rb",
	"swift",
	"css",
	"html",
	"sh",
]);
const DATA_EXTENSIONS = new Set(["json", "yaml", "yml", "toml", "lock"]);
const ARCHIVE_EXTENSIONS = new Set(["zip", "tar", "gz", "tgz", "7z", "rar"]);

// Mime type first (audio, images demoted after a failed preview), then
// extension for the text-ish formats mime can't distinguish.
function fileTypeIcon(mediaType: string, extension: string): JSX.Element {
	if (mediaType.startsWith("audio/"))
		return <Music2Icon className="size-5 text-muted-foreground" />;
	if (mediaType.startsWith("image/"))
		return <ImageIcon className="size-5 text-muted-foreground" />;
	const lowered = extension.toLowerCase();
	if (CODE_EXTENSIONS.has(lowered))
		return <FileCode2Icon className="size-5 text-muted-foreground" />;
	if (DATA_EXTENSIONS.has(lowered))
		return <FileJson2Icon className="size-5 text-muted-foreground" />;
	if (ARCHIVE_EXTENSIONS.has(lowered))
		return <FileArchiveIcon className="size-5 text-muted-foreground" />;
	return <FileTextIcon className="size-5 text-muted-foreground" />;
}

export type AttachmentFileCardProps = {
	name: string;
	mediaType: string;
	onClick?: () => void;
	className?: string;
};

export function AttachmentFileCard({
	name,
	mediaType,
	onClick,
	className,
}: AttachmentFileCardProps) {
	const dotIndex = name.lastIndexOf(".");
	const hasExtension = dotIndex > 0 && dotIndex < name.length - 1;
	const stem = hasExtension ? name.slice(0, dotIndex) : name;
	const extension = hasExtension ? name.slice(dotIndex + 1).toUpperCase() : "";
	const Root = onClick ? "button" : "div";
	return (
		<Root
			{...(onClick ? { type: "button" as const, onClick } : {})}
			title={name}
			className={cn(
				"group/attachment relative flex h-16 w-[200px] items-center gap-2.5 overflow-hidden rounded-xl border-[0.5px] border-border bg-foreground/[0.03] px-2.5 text-left",
				onClick && "cursor-pointer",
				className,
			)}
		>
			{onClick && (
				<span className="pointer-events-none absolute inset-0 bg-foreground/[0.02] opacity-0 transition-opacity duration-150 group-hover/attachment:opacity-100" />
			)}
			<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06]">
				{fileTypeIcon(mediaType, extension)}
			</div>
			<div className="min-w-0 flex-1 pr-3">
				<div className="truncate text-foreground text-xs">{stem}</div>
				{extension && (
					<div className="text-[10px] text-muted-foreground">{extension}</div>
				)}
			</div>
		</Root>
	);
}
