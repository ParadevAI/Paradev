import { Trans, useLingui } from "@lingui/react/macro";
import { Bot } from "lucide-react";
import type { FinishedSubagent } from "../../stores/activityPanelStore";

export function FinishedSubagentRow({
	entry,
	source,
	onOpen,
}: {
	entry: FinishedSubagent;
	source?: string;
	onOpen: (entry: FinishedSubagent) => void;
}) {
	const { t } = useLingui();
	return (
		<button
			type="button"
			onClick={() => onOpen(entry)}
			className="flex min-h-7 w-full items-center gap-2 rounded-sm py-0.5 pr-2 pl-2 text-left text-xs outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
		>
			<Bot className="size-3.5 shrink-0 text-muted-foreground" />
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="min-w-0 truncate text-foreground/80">
					{entry.name || t({ message: "Subagent" })}
				</span>
				{source && (
					<span className="min-w-0 truncate text-[11px] text-muted-foreground/70">
						{source}
					</span>
				)}
			</span>
			<span className="shrink-0 text-[11px] text-muted-foreground/70">
				<Trans context="subagent status">Done</Trans>
			</span>
		</button>
	);
}
