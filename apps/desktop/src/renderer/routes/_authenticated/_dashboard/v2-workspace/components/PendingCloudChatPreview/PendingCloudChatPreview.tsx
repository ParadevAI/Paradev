import { Trans } from "@lingui/react/macro";
import { Spinner } from "@superset/ui/spinner";
import { MessageSquare } from "lucide-react";

export function PendingCloudChatPreview({
	label,
	prompt,
}: {
	label: string;
	prompt?: string;
}) {
	return (
		<div className="flex h-full w-full flex-col pt-12">
			<div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 text-muted-foreground text-xs">
				<MessageSquare className="size-3.5" aria-hidden="true" />
				<span className="truncate">{label}</span>
			</div>
			<div className="min-h-0 flex-1" />
			<div className="px-6 pb-5">
				<div className="mx-auto w-full max-w-3xl">
					{prompt ? (
						<p className="mb-3 ml-auto line-clamp-6 w-fit max-w-[80%] whitespace-pre-wrap break-words rounded-xl bg-muted/40 px-3 py-2 text-foreground/70 text-sm">
							{prompt}
						</p>
					) : null}
					<output className="flex items-center gap-2 px-4 pb-2 text-foreground/50 text-xs">
						<Spinner className="size-3" />
						<Trans>Starting the agent…</Trans>
					</output>
					<div
						className="h-28 rounded-xl border border-border/60 bg-muted/10 p-4"
						aria-hidden="true"
					>
						<div className="h-2 w-2/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
					</div>
				</div>
			</div>
		</div>
	);
}
