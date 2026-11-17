import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import {
	ArrowDownToLine,
	ChevronRight,
	MessageSquareText,
	Square,
} from "lucide-react";
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
import { SubagentAvatar } from "../SubagentAvatar";

const ACTION_CLASSNAME =
	"relative z-[1] flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-sans text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";
const HOVER_ONLY_CLASSNAME =
	"opacity-0 transition-opacity group-focus-within/run:opacity-100 group-hover/run:opacity-100 focus-visible:opacity-100";

export function SubagentRunRow({ row }: { row: Row }) {
	const { t } = useLingui();
	const { openSubagent, moveToBackground, stopTask, retrySubagent } =
		useNestedItems();
	const { openDiff, worktreePath } = useChatPaneActions();
	const [stopping, setStopping] = useState(false);
	const [nestedOpen, setNestedOpen] = useState(false);
	const name = row.name || t({ message: "Subagent" });
	const live = isRowLive(row);
	const filesFilter =
		row.files.length > 0
			? reviewFilter(row.files.map((path) => filePlace(path, worktreePath)))
			: null;
	const stop = () => {
		if (!stopTask) return;
		setStopping(true);
		void stopTask(row.itemId).finally(() => setStopping(false));
	};
	return (
		<div data-run-phase={row.phase} data-subagent-run={row.itemId}>
			<div className="group/run relative flex min-w-0 items-center gap-1 rounded-lg px-1.5 py-0.5 font-sans text-sm transition-colors focus-within:bg-accent/60 hover:bg-accent/60">
				<button
					className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:ring-1 focus-visible:after:ring-ring/60"
					onClick={() => openSubagent(row.itemId)}
					title={row.task ?? undefined}
					type="button"
				>
					<SubagentAvatar seed={row.itemId} />
					<span className="flex min-w-0 shrink items-baseline gap-1.5">
						<span
							className="min-w-0 truncate font-medium text-foreground/90"
							data-find-item={row.itemId}
						>
							{name}
						</span>
						{row.model && (
							<span className="shrink-0 text-muted-foreground/50 text-xs">
								{row.model}
							</span>
						)}
					</span>
					<span className="flex min-w-0 flex-1 items-center gap-1.5 text-muted-foreground/70 text-xs">
						<RunStatus
							endedAtMs={row.endedAtMs}
							startedAtMs={row.startedAtMs}
							status={row.phase}
							waitingOn={liveRunRows(row.nested).length}
						/>
						{row.outcome ? (
							<span
								className={cn(
									"min-w-0 truncate",
									row.phase === "failed" && "text-destructive/70",
								)}
							>
								<span aria-hidden="true">→ </span>
								{row.outcome}
							</span>
						) : (
							row.action && (
								<span className="min-w-0 truncate">{row.action}</span>
							)
						)}
					</span>
				</button>
				{row.nested.length > 0 && (
					<button
						aria-expanded={nestedOpen}
						className={ACTION_CLASSNAME}
						onClick={() => setNestedOpen((open) => !open)}
						type="button"
					>
						{t({
							message: plural(row.nested.length, {
								one: "# subagent",
								other: "# subagents",
							}),
						})}
						<ChevronRight
							className={cn(
								"size-3 transition-transform duration-200",
								nestedOpen && "rotate-90",
							)}
						/>
					</button>
				)}
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
						<MessageSquareText className="size-3" />
						<Trans>Message</Trans>
					</button>
				)}
				{row.canBackground && moveToBackground && (
					<HotkeyTooltip id="MOVE_TO_BACKGROUND" side="top">
						<button
							aria-label={t({ message: `Move ${name} to background` })}
							className={cn(ACTION_CLASSNAME, HOVER_ONLY_CLASSNAME, "px-1")}
							onClick={() => moveToBackground(row.itemId)}
							type="button"
						>
							<ArrowDownToLine className="size-3" />
						</button>
					</HotkeyTooltip>
				)}
				{row.canStop && stopTask && (
					<button
						aria-label={t({ message: `Stop ${name}` })}
						className={cn(ACTION_CLASSNAME, "text-foreground/80")}
						disabled={stopping}
						onClick={stop}
						type="button"
					>
						<Square className="size-2.5 fill-current" />
						<Trans>Stop</Trans>
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
				<ChevronRight
					aria-hidden="true"
					className="size-3.5 shrink-0 text-muted-foreground/45 opacity-0 transition-opacity group-focus-within/run:opacity-100 group-hover/run:opacity-100"
				/>
			</div>
			{row.nested.length > 0 && nestedOpen && (
				<div className="ml-[0.85rem] border-border/60 border-l pl-2">
					{row.nested.map((nested) => (
						<SubagentRunRow key={nested.itemId} row={nested} />
					))}
				</div>
			)}
		</div>
	);
}
