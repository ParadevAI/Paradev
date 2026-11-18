import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { TurnUndoResult } from "@superset/chat-runtime";
import { formatList } from "@superset/i18n/format";
import { fileName } from "../../../../../../utils/fileChange";

export type UndoOutcome = TurnUndoResult | "unsupported" | "failed";

/** What an Undo did, or why it did nothing; files it left alone are named. */
export function UndoOutcomeNotice({ outcome }: { outcome: UndoOutcome }) {
	const { t } = useLingui();
	if (typeof outcome === "string" || outcome.status === "refused") {
		const reason = typeof outcome === "string" ? outcome : outcome.reason;
		const messages: Record<typeof reason, string> = {
			failed: t({ message: "Couldn't undo the file changes." }),
			unsupported: t({
				message: "This workspace's host can't undo file changes yet.",
			}),
			busy: t({
				message: "Can't undo while a chat in this workspace is working.",
			}),
			"head-moved": t({
				message:
					"Can't undo: HEAD moved since this turn, by a commit, pull or checkout.",
			}),
			missing: t({ message: "Can't undo: this turn's snapshots are missing." }),
			shared: t({
				message:
					"Can't undo: another chat worked in this workspace during this turn.",
			}),
		};
		return (
			<p className="border-border/50 border-t px-3 py-1.5 text-warning text-xs">
				{messages[reason]}
			</p>
		);
	}
	const restoredCount = outcome.restored.length;
	const skippedNames = formatList(outcome.skipped.map(fileName));
	return (
		<div className="flex flex-col gap-0.5 border-border/50 border-t px-3 py-1.5 text-xs">
			<p className="text-muted-foreground">
				{restoredCount === 0
					? t({
							message:
								"Every file changed again since this turn, so nothing was undone.",
						})
					: plural(restoredCount, {
							one: "Undid the changes to # file.",
							other: "Undid the changes to # files.",
						})}
			</p>
			{outcome.skipped.length > 0 && (
				<p className="text-warning">
					{restoredCount === 0
						? skippedNames
						: t({
								message: `Left alone, changed since this turn: ${skippedNames}`,
							})}
				</p>
			)}
		</div>
	);
}
