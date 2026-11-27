"use client";

import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { countLines, firstLine } from "@superset/chat/core";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { TextQuoteIcon, XIcon } from "lucide-react";

export type QuoteCardProps = {
	text: string;
	onRemove: () => void;
};

export function QuoteCard({ text, onRemove }: QuoteCardProps) {
	const { t } = useLingui();
	const lines = countLines(text);
	return (
		<div
			className="relative inline-flex max-w-[16rem] shrink-0 select-none items-center gap-2 rounded-lg border-[0.5px] border-border bg-foreground/[0.03] py-1 pr-7 pl-1"
			data-quote-card
		>
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="flex min-w-0 items-center gap-2">
						<span
							aria-hidden
							className="flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground/[0.06] text-muted-foreground"
						>
							<TextQuoteIcon className="size-3.5" />
						</span>
						<span className="flex min-w-0 flex-col gap-0.5 leading-tight">
							<span className="truncate font-medium text-[13px]">
								{firstLine(text)}
							</span>
							<span className="whitespace-nowrap text-muted-foreground text-xs">
								{t({
									message: plural(lines, {
										one: "Quote",
										other: "Quote · # lines",
									}),
								})}
							</span>
						</span>
					</span>
				</TooltipTrigger>
				<TooltipContent className="max-w-sm" side="top">
					<p className="line-clamp-[12] whitespace-pre-wrap break-words">
						{text}
					</p>
				</TooltipContent>
			</Tooltip>
			<button
				type="button"
				aria-label={t({ message: "Remove quote" })}
				className="absolute top-1/2 right-1 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
				onClick={onRemove}
			>
				<XIcon className="size-3" />
			</button>
		</div>
	);
}
