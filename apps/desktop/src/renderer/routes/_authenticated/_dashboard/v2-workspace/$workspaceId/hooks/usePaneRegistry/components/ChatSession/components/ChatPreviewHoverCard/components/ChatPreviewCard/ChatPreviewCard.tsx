import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { MessageSquare } from "lucide-react";
import type { PreviewMessage } from "../../utils/previewMessages";

export type ChatPreviewLoad =
	| { status: "loading" }
	| { status: "ready"; title: string | null; messages: PreviewMessage[] }
	| { status: "unavailable" };

export function ChatPreviewCard({ load }: { load: ChatPreviewLoad }) {
	const { t } = useLingui();
	const title =
		load.status === "ready" && load.title ? load.title : t({ message: "Chat" });
	return (
		<div className="min-w-0 p-3.5 text-left font-sans text-foreground">
			<div className="flex min-w-0 items-center gap-2 text-[11px]">
				<MessageSquare
					aria-hidden="true"
					className="size-4 shrink-0 text-foreground/50"
				/>
				<span className="min-w-0 truncate font-semibold text-[13px] text-foreground">
					{title}
				</span>
			</div>
			{load.status === "loading" ? (
				<output
					aria-label={t({ message: "Loading chat" })}
					className="mt-2.5 block space-y-2"
				>
					<div className="h-2 w-4/5 rounded bg-foreground/10 motion-safe:animate-pulse" />
					<div className="h-2 w-full rounded bg-foreground/[0.07] motion-safe:animate-pulse" />
					<div className="h-2 w-2/3 rounded bg-foreground/[0.07] motion-safe:animate-pulse" />
				</output>
			) : load.status === "unavailable" ? (
				<p className="mt-2 text-[11px] text-foreground/50 leading-relaxed">
					<Trans>
						This chat may have been removed or you may not have access.
					</Trans>
				</p>
			) : load.messages.length === 0 ? (
				<p className="mt-2 text-[11px] text-foreground/50">
					<Trans>This chat is empty.</Trans>
				</p>
			) : (
				<ol className="mt-2.5 space-y-2">
					{load.messages.map((message) => (
						<li
							className={cn(
								"line-clamp-3 text-[11px] leading-[1.45]",
								message.from === "user"
									? "rounded-md bg-foreground/[0.05] px-2 py-1 text-foreground/75"
									: "text-foreground/60",
							)}
							key={message.id}
						>
							{message.text}
						</li>
					))}
				</ol>
			)}
		</div>
	);
}
