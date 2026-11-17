import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { Bot, Square } from "lucide-react";
import { useState } from "react";
import { HotkeyTooltip } from "renderer/hotkeys";
import { useChatPaneActions } from "../../../../../../providers/ChatPaneActionsProvider";
import { filePlace, reviewFilter } from "../../../../../../utils/filePlace";
import { useNestedItems } from "../../../../providers/NestedItemsProvider";
import {
	isRowLive,
	liveRunRows,
	type SubagentRunRow as Row,
} from "../../../../utils/subagentRuns";
import { RunStatus } from "../../../RunStatus";

const ACTION_CLASSNAME =
	"shrink-0 rounded px-1 font-sans text-foreground/45 text-xs transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";
const HOVER_ONLY_CLASSNAME =
	"opacity-0 group-focus-within/run:opacity-100 group-hover/run:opacity-100 focus-visible:opacity-100";

export function SubagentRunRow({ row }: { row: Row }) {
	const { t } = useLingui();
	const { openSubagent, moveToBackground, stopTask, retrySubagent } =
		useNestedItems();
	const { openDiff, worktreePath } = useChatPaneActions();
	const [stopping, setStopping] = useState(false);
	const name = row.name || t({ message: "Subagent" });
	const live = isRowLive(row);
	const filesFilter =
		row.files.length > 0
			? reviewFilter(row.files.map((path) => filePlace(path, worktreePath)))
			: null;
	const detail = row.outcome ?? row.action;
	const stop = () => {
		if (!stopTask) return;
		setStopping(true);
		void stopTask(row.itemId).finally(() => setStopping(false));
	};
	return (
		<div data-run-phase={row.phase} data-subagent-run={row.itemId}>
			<div className="group/run flex min-w-0 items-center gap-1.5 font-sans text-sm">
				<button
					className="flex min-w-0 flex-1 items-center gap-1.5 rounded py-1 text-left transition-colors duration-200 hover:text-foreground/80 focus-visible:outline-2 focus-visible:outline-ring"
					onClick={() => openSubagent(row.itemId)}
					title={row.task ?? undefined}
					type="button"
				>
					<Bot
						className={cn(
							"size-3.5 shrink-0",
							row.phase === "failed"
								? "text-destructive/80"
								: "text-muted-foreground",
						)}
					/>
					<span
						className="min-w-0 shrink truncate text-foreground/75"
						data-find-item={row.itemId}
					>
						{name}
					</span>
					{row.model && (
						<span className="shrink-0 text-foreground/35 text-xs">
							{row.model}
						</span>
					)}
					<RunStatus
						endedAtMs={row.endedAtMs}
						startedAtMs={row.startedAtMs}
						status={row.phase}
						waitingOn={liveRunRows(row.nested).length}
					/>
					{detail && (
						<span
							className={cn(
								"min-w-[4rem] flex-1 truncate",
								row.phase === "failed"
									? "text-destructive/70"
									: "text-foreground/40",
							)}
						>
							{row.outcome ? `→ ${detail}` : detail}
						</span>
					)}
				</button>
				{filesFilter && openDiff && (
					<button
						className={ACTION_CLASSNAME}
						onClick={() => openDiff(filesFilter)}
						type="button"
					>
						{t({
							message: plural(row.files.length, {
								one: "# file changed",
								other: "# files changed",
							}),
						})}
					</button>
				)}
				{row.canSteer && (
					<button
						className={cn(ACTION_CLASSNAME, HOVER_ONLY_CLASSNAME)}
						onClick={() => openSubagent(row.itemId)}
						type="button"
					>
						<Trans>Message</Trans>
					</button>
				)}
				{row.canBackground && moveToBackground && (
					<HotkeyTooltip id="MOVE_TO_BACKGROUND" side="top">
						<button
							aria-label={t({ message: `Move ${name} to background` })}
							className={ACTION_CLASSNAME}
							onClick={() => moveToBackground(row.itemId)}
							type="button"
						>
							<Trans>Move to background</Trans>
						</button>
					</HotkeyTooltip>
				)}
				{row.canStop && stopTask && (
					<button
						aria-label={t({ message: `Stop ${name}` })}
						className={cn(
							ACTION_CLASSNAME,
							"flex size-5 items-center justify-center px-0",
						)}
						disabled={stopping}
						onClick={stop}
						title={t({ message: "Stop" })}
						type="button"
					>
						<Square className="size-2.5 fill-current" />
					</button>
				)}
				{!live && row.phase === "failed" && row.prompt && retrySubagent && (
					<button
						className={ACTION_CLASSNAME}
						onClick={() => retrySubagent(name, row.prompt ?? "")}
						type="button"
					>
						<Trans>Retry</Trans>
					</button>
				)}
			</div>
			{row.nested.length > 0 && (
				<div className="ml-[7px] border-border/60 border-l pl-3">
					{row.nested.map((nested) => (
						<SubagentRunRow key={nested.itemId} row={nested} />
					))}
				</div>
			)}
		</div>
	);
}
