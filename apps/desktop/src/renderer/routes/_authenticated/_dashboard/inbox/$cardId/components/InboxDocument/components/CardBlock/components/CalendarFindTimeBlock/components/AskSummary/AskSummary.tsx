import { Trans } from "@lingui/react/macro";
import { LuExternalLink } from "react-icons/lu";
import { BrandMark } from "renderer/routes/_authenticated/_dashboard/components/BrandMark";
import type { CalendarFindTimeView } from "../../../../types";

interface AskSummaryProps {
	ask: CalendarFindTimeView["ask"];
}

/** The message that asked to meet, with the way back to it. */
export function AskSummary({ ask }: AskSummaryProps) {
	return (
		<div className="flex flex-col gap-1 border-b border-border px-4 py-3 text-[13px]">
			<div className="flex items-center gap-2">
				<BrandMark brand={ask.source} />
				<span className="min-w-0 truncate font-medium text-foreground">
					{ask.from}
				</span>
				{ask.subject && (
					<span className="min-w-0 flex-1 truncate text-muted-foreground">
						{ask.subject}
					</span>
				)}
				{ask.url && (
					<a
						href={ask.url}
						target="_blank"
						rel="noreferrer"
						className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
					>
						{ask.source === "gmail" ? (
							<Trans>Open in Gmail</Trans>
						) : (
							<Trans>Open in Slack</Trans>
						)}
						<LuExternalLink className="size-3" />
					</a>
				)}
			</div>
			<p className="line-clamp-3 whitespace-pre-wrap text-muted-foreground">
				{ask.snippet}
			</p>
		</div>
	);
}
