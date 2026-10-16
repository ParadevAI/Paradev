import { Trans, useLingui } from "@lingui/react/macro";
import { formatAge } from "@superset/i18n/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuArchive } from "react-icons/lu";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import { InboxCardShell, inboxPillButton } from "../InboxCardShell";

interface FinishedWorkspaceRowProps {
	itemId: string;
	/** The row the detail pane shows. */
	selected?: boolean;
	workspaceName: string;
	finishedAt: Date;
	now: Date;
	/** What the agent wrote about this turn, when it also pushed a card. */
	note?: string;
	onOpen: () => void;
	onDismiss: () => void;
}

/** A workspace whose agent finished, as an inbox card: its name, the sidebar's status dot, and when the turn ended. */
export function FinishedWorkspaceRow({
	itemId,
	selected,
	workspaceName,
	finishedAt,
	now,
	note,
	onOpen,
	onDismiss,
}: FinishedWorkspaceRowProps) {
	const { t } = useLingui();
	return (
		<InboxCardShell
			itemId={itemId}
			selected={selected}
			icon={<StatusIndicator status="review" />}
			title={workspaceName}
			when={formatAge(finishedAt, now.getTime())}
			unread
			onOpen={onOpen}
			toolbar={
				<Tooltip delayDuration={400}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={(event) => {
								event.stopPropagation();
								onDismiss();
							}}
							aria-label={t({ message: "Dismiss" })}
							className={inboxPillButton}
						>
							<LuArchive className="size-3.5" strokeWidth={1.5} />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<Trans>Dismiss. It comes back when the agent finishes again.</Trans>
					</TooltipContent>
				</Tooltip>
			}
		>
			<span className="text-xs leading-relaxed text-muted-foreground">
				<Trans>Agent finished</Trans>
			</span>
			{note && (
				<span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
					{note}
				</span>
			)}
		</InboxCardShell>
	);
}
