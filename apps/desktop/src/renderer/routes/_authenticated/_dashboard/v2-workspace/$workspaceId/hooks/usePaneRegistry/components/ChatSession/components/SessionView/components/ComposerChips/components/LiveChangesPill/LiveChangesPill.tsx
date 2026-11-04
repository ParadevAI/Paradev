import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import { FileDiff } from "lucide-react";
import { DiffStatText } from "../../../../../../../../../../components/DiffStatText";
import { useTurnChanges } from "../../../../../../hooks/useTurnChanges";
import { useChatPaneActions } from "../../../../../../providers/ChatPaneActionsProvider";
import { reviewFilter, rootPlace } from "../../../../../../utils/filePlace";
import { COMPOSER_CHIP_CLASSNAME } from "../../constants";

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
	const label = plural(changedCount, {
		one: "Changes · # file",
		other: "Changes · # files",
	});
	return (
		<button
			className={COMPOSER_CHIP_CLASSNAME}
			disabled={!filter || !openDiff}
			onClick={() => filter && openDiff?.(filter)}
			title={t({ message: "Review what this turn has changed so far" })}
			type="button"
		>
			<FileDiff className="size-3 shrink-0" />
			<span className="hidden truncate @[28rem]:inline">{label}</span>
			<span aria-hidden="true" className="tabular-nums @[28rem]:hidden">
				{formatNumber(changedCount)}
			</span>
			<span className="sr-only @[28rem]:hidden">{label}</span>
			<span className="shrink-0 font-mono tabular-nums">
				<DiffStatText
					additions={totals.additions}
					deletions={totals.deletions}
				/>
			</span>
		</button>
	);
}
