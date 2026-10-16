"use client";

import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { countLines, firstLine } from "@superset/chat/core";
import { cn } from "@superset/ui/utils";
import { FileTextIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

export type PastedTextCardProps = {
	text: string;
	action: ReactNode;
	onRemove?: () => void;
	// What copying a selection across the card gives back.
	sourceText?: string;
	className?: string;
};

export function PastedTextCard({
	text,
	action,
	onRemove,
	sourceText,
	className,
}: PastedTextCardProps) {
	const { t } = useLingui();
	const lines = countLines(text);
	const title = firstLine(text);
	return (
		<div
			className={cn(
				"relative inline-flex max-w-[16rem] select-none items-center gap-2 rounded-lg border-[0.5px] border-border bg-foreground/[0.03] py-1 pl-1",
				onRemove ? "pr-7" : "pr-2.5",
				className,
			)}
			data-pasted-text-card
			data-source-text={sourceText}
		>
			<span
				aria-hidden
				className="flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground/[0.06] text-muted-foreground"
			>
				<FileTextIcon className="size-3.5" />
			</span>
			<span className="flex min-w-0 flex-col gap-0.5 leading-tight">
				<span className="truncate font-medium text-[13px]" title={title}>
					{title}
				</span>
				<span className="flex items-center gap-1 whitespace-nowrap text-muted-foreground text-xs">
					{action}
					<span aria-hidden>·</span>
					<span>
						{t({
							message: plural(lines, { one: "# line", other: "# lines" }),
						})}
					</span>
				</span>
			</span>
			{onRemove && (
				<button
					type="button"
					aria-label={t({ message: "Remove pasted text" })}
					className="absolute top-1/2 right-1 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
					onClick={onRemove}
				>
					<XIcon className="size-3" />
				</button>
			)}
		</div>
	);
}

export const PASTED_TEXT_ACTION_CLASS =
	"cursor-pointer font-medium underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:text-foreground";
