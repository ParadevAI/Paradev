import { Trans } from "@lingui/react/macro";
import { formatCompactRelativeTime } from "@superset/i18n/format";
import { useAgentLastMessage } from "../../../../../../hooks/useAgentSession";
import { previewLine } from "../../../../../../utils/previewLine";
import { StateDot } from "../../../../../StateDot";

interface WorkingNoteProps {
	workspaceId: string;
	hostUrl: string | null;
	sessionId: string;
}

/**
 * One line under the header while the agent works: its latest word on what
 * it is doing, and how long ago it said it, so the chat below need not be
 * scrolled to know.
 */
export function WorkingNote({
	workspaceId,
	hostUrl,
	sessionId,
}: WorkingNoteProps) {
	const { data } = useAgentLastMessage(hostUrl, workspaceId, sessionId);
	const line = data ? previewLine(data.text) : null;
	return (
		<div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-4 text-[12px] leading-4">
			<StateDot state="working" />
			<span className="min-w-0 flex-1 truncate text-foreground/90">
				{line || <Trans>Working…</Trans>}
			</span>
			{data?.at && (
				<span className="shrink-0 text-muted-foreground tabular-nums">
					{formatCompactRelativeTime(new Date(data.at))}
				</span>
			)}
		</div>
	);
}
