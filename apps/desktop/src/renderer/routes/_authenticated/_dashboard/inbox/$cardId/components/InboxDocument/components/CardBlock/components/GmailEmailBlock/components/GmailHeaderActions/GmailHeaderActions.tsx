import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuArchive, LuExternalLink } from "react-icons/lu";
import { useActionKey } from "../../../../providers/ActionKeysProvider";
import { ActionKeycap } from "../../../ActionKeycap";
import { HeaderActions } from "../../../HeaderActions";
import type { Resolved } from "../../types";

interface GmailHeaderActionsProps {
	slot: HTMLElement | null;
	actions: Resolved["actions"];
	done: boolean;
	pending: boolean;
	gmailUrl: string;
	onAct: (actionId: string) => void;
}

/** Archive, "This is nothing" and the way to Gmail, in the card's header row. */
export function GmailHeaderActions({
	slot,
	actions,
	done,
	pending,
	gmailUrl,
	onAct,
}: GmailHeaderActionsProps) {
	const { t } = useLingui();
	const archiveKey = useActionKey("archive");
	const nothingKey = useActionKey("nothing");
	const archive = done ? undefined : actions.find((a) => a.id === "archive");
	const nothing = done ? undefined : actions.find((a) => a.id === "nothing");
	return (
		<HeaderActions slot={slot}>
			{archive && (
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<span>
							<button
								type="button"
								aria-label={t({ message: "Archive" })}
								disabled={pending || Boolean(archive.disabled)}
								data-action-key={archiveKey}
								onClick={() => onAct("archive")}
								className="flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
							>
								<LuArchive className="size-4" />
								<ActionKeycap slot={archiveKey} />
							</button>
						</span>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						{archive.disabled ?? t({ message: "Archive" })}
					</TooltipContent>
				</Tooltip>
			)}
			{nothing && (
				<Button
					variant="ghost"
					size="sm"
					disabled={pending}
					data-action-key={nothingKey}
					onClick={() => onAct("nothing")}
					className="h-7 px-2 text-xs text-muted-foreground"
				>
					{t({ message: "This is nothing" })}
					<ActionKeycap slot={nothingKey} />
				</Button>
			)}
			<a
				href={gmailUrl}
				target="_blank"
				rel="noreferrer"
				className="ml-1 inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
			>
				<Trans>Open in Gmail</Trans>
				<LuExternalLink className="size-3" />
			</a>
		</HeaderActions>
	);
}
