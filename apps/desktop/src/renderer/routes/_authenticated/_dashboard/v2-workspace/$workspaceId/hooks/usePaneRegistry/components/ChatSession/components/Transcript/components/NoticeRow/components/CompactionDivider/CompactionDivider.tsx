import { Trans, useLingui } from "@lingui/react/macro";
import type { NoticeCompaction } from "@superset/chat/protocol";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { ChevronDown, CircleDashed, FoldVertical } from "lucide-react";
import { formatTokens } from "../../../../../../utils/formatTokens";
import { MarkdownView } from "../../../../../MarkdownView";

export function CompactionDivider({
	compaction,
}: {
	compaction: NoticeCompaction | undefined;
}) {
	const { t } = useLingui();
	const status = compaction?.status ?? "completed";
	const title =
		status === "running"
			? t({ message: "Compacting context…" })
			: status === "failed"
				? t({ message: "Compaction failed" })
				: status === "cancelled"
					? t({ message: "Compaction stopped" })
					: compaction?.trigger === "automatic"
						? t({ message: "Context compacted automatically" })
						: t({ message: "Context compacted" });
	const from =
		compaction?.tokensBefore === undefined
			? null
			: formatTokens(compaction.tokensBefore);
	const to =
		compaction?.tokensAfter === undefined
			? null
			: formatTokens(compaction.tokensAfter);
	const tokens =
		status === "completed" && from && to
			? t({ message: `${from} → ${to} tokens` })
			: null;
	const detail = status === "failed" ? compaction?.error : tokens;
	const summary = status === "completed" ? compaction?.summary : undefined;
	const Icon = status === "running" ? CircleDashed : FoldVertical;
	const label = (
		<>
			<Icon
				aria-hidden
				className={cn(
					"size-3.5 shrink-0",
					status === "running" &&
						"animate-spin-slow text-foreground/40 motion-reduce:animate-none",
				)}
				strokeWidth={1.75}
			/>
			<span className="shrink-0">{title}</span>
			{detail && (
				<span className="min-w-0 truncate tabular-nums" title={detail}>
					· {detail}
				</span>
			)}
		</>
	);
	return (
		<Collapsible
			className="my-3"
			data-testid="compaction-divider"
			data-status={status}
		>
			<div className="flex items-center gap-3 text-muted-foreground text-xs">
				<span aria-hidden className="h-px min-w-6 flex-1 bg-border" />
				{summary ? (
					<CollapsibleTrigger className="group flex min-w-0 max-w-[80%] items-center gap-1.5 rounded px-1 outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring">
						{label}
						<span className="sr-only">
							<Trans>Show the summary</Trans>
						</span>
						<ChevronDown
							aria-hidden
							className="size-3 shrink-0 transition-transform group-data-[state=open]:rotate-180"
						/>
					</CollapsibleTrigger>
				) : (
					<span
						className={cn(
							"flex min-w-0 max-w-[80%] items-center gap-1.5 px-1",
							status === "failed" && "text-destructive",
						)}
					>
						{label}
					</span>
				)}
				<span aria-hidden className="h-px min-w-6 flex-1 bg-border" />
			</div>
			{summary && (
				<CollapsibleContent className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
					<MarkdownView className="text-foreground/60 text-xs" text={summary} />
				</CollapsibleContent>
			)}
		</Collapsible>
	);
}
