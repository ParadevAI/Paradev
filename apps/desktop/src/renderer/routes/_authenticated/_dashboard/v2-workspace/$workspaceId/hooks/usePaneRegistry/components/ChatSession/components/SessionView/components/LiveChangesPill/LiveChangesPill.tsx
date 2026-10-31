import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { FileDiff } from "lucide-react";
import { DiffStatText } from "../../../../../../../../components/DiffStatText";
import {
	CHAT_COLUMN_CLASSNAME,
	CHAT_GUTTER_CLASSNAME,
} from "../../../../constants";
import { useTurnChanges } from "../../../../hooks/useTurnChanges";
import { useChatPaneActions } from "../../../../providers/ChatPaneActionsProvider";
import { reviewFilter, rootPlace } from "../../../../utils/filePlace";

/**
 * What the running turn has changed so far, above the composer. It reads a
 * fresh snapshot as the agent's tool calls finish, and opens that diff.
 */
export function LiveChangesPill({
	refreshKey,
	turnId,
}: {
	refreshKey: number;
	turnId: string;
}) {
	const { t } = useLingui();
	const { openDiff } = useChatPaneActions();
	const { changes } = useTurnChanges(turnId, { live: true, refreshKey });
	const changedCount = changes?.files.length ?? 0;
	if (!changes || changedCount === 0) return null;

	const totals = changes.files.reduce(
		(sum, file) => ({
			additions: sum.additions + (file.additions ?? 0),
			deletions: sum.deletions + (file.deletions ?? 0),
		}),
		{ additions: 0, deletions: 0 },
	);
	const filter = reviewFilter(
		changes.files.map((file) => rootPlace(changes.root, file.path)),
		{ fromHash: changes.before, toHash: changes.after },
	);
	return (
		<div className={CHAT_GUTTER_CLASSNAME}>
			<div className={CHAT_COLUMN_CLASSNAME}>
				<div className="mb-1.5 flex">
					<button
						className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-card px-2.5 py-0.5 text-muted-foreground text-xs ring-1 ring-border transition-colors hover:text-foreground disabled:cursor-default"
						disabled={!filter || !openDiff}
						onClick={() => filter && openDiff?.(filter)}
						title={t({ message: "Review what this turn has changed so far" })}
						type="button"
					>
						<FileDiff className="size-3 shrink-0" />
						<span className="truncate">
							{plural(changedCount, {
								one: "Changes · # file",
								other: "Changes · # files",
							})}
						</span>
						<span className="shrink-0 font-mono tabular-nums">
							<DiffStatText
								additions={totals.additions}
								deletions={totals.deletions}
							/>
						</span>
					</button>
				</div>
			</div>
		</div>
	);
}
