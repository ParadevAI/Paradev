import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { ChevronDown, FileDiff, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { DiscardConfirmDialog } from "renderer/routes/_authenticated/_dashboard/components/DiscardConfirmDialog";
import { DiffStatText } from "../../../../../../../../../../components/DiffStatText";
import type { DiffPaneFilter } from "../../../../../../../../../../types";
import { useTurnChanges } from "../../../../../../hooks/useTurnChanges";
import { useChatPaneActions } from "../../../../../../providers/ChatPaneActionsProvider";
import { reviewFilter } from "../../../../../../utils/filePlace";
import type { TurnFileChange } from "../../../../utils/turnChangedFiles";
import { ChangedFileRow } from "./components/ChangedFileRow";
import {
	type UndoOutcome,
	UndoOutcomeNotice,
} from "./components/UndoOutcomeNotice";
import { FOLDED_FILE_COUNT, MAX_UNFOLDED_FILES } from "./constants";
import { type CardFile, cardFiles } from "./utils/cardFiles";

function statWidthFor(files: readonly CardFile[]): string {
	const longest = Math.max(
		0,
		...files.flatMap((file) =>
			file.stats ? [file.stats.additions, file.stats.deletions] : [],
		),
	);
	return `${String(longest).length + 2}ch`;
}

/**
 * What a settled turn changed, under its answer: a one-line count and total,
 * Review for the turn's files in the diff pane, and a row per file. Worktree
 * snapshots make it exact when the host keeps them; the turn's tool calls
 * stand in when it does not. The newest card can undo its files.
 */
export function TurnChangesCard({
	files: toolFiles,
	newest = false,
	toolCallIds,
	turnId,
}: {
	files: readonly TurnFileChange[];
	newest?: boolean;
	toolCallIds: string[];
	turnId: string;
}) {
	const { t } = useLingui();
	const { openDiff, openFile, turnChanges, workspaceId } = useChatPaneActions();
	const workspaceQuery = workspaceTrpc.workspace.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: Boolean(workspaceId) },
	);
	const worktreePath = workspaceQuery.data?.worktreePath;
	const { changes, reload } = useTurnChanges(turnId, {
		anchorItemIds: toolCallIds,
	});
	const [expanded, setExpanded] = useState(false);
	const [othersOpen, setOthersOpen] = useState(false);
	const [confirmingUndo, setConfirmingUndo] = useState(false);
	const [undoing, setUndoing] = useState(false);
	const [outcome, setOutcome] = useState<UndoOutcome | null>(null);

	const { files, others, own } = useMemo(
		() => cardFiles(toolFiles, changes, worktreePath),
		[toolFiles, changes, worktreePath],
	);
	const range = changes
		? { fromHash: changes.before, toHash: changes.after }
		: undefined;
	const filter = reviewFilter(
		files.map((file) => file.place),
		range,
	);
	const othersFilter = reviewFilter(
		others.map((file) => file.place),
		range,
	);
	if (changes?.undone) {
		const skipped = changes.undoSkipped ?? [];
		const shownOutcome: UndoOutcome | null =
			outcome ??
			(skipped.length > 0
				? {
						status: "undone",
						restored: files.flatMap(({ place }) =>
							place.relativePath && !skipped.includes(place.relativePath)
								? [place.relativePath]
								: [],
						),
						skipped,
					}
				: null);
		return (
			<div className="mt-1 mb-2 overflow-hidden rounded-lg border border-border/60 text-[13px]">
				<div className="flex items-center gap-2 px-3 py-1.5 text-muted-foreground">
					<Undo2 className="size-3.5 shrink-0" />
					<Trans>File changes undone</Trans>
				</div>
				{shownOutcome && <UndoOutcomeNotice outcome={shownOutcome} />}
			</div>
		);
	}
	if (files.length === 0) return null;

	const totals = files.reduce(
		(sum, file) => ({
			additions: sum.additions + (file.stats?.additions ?? 0),
			deletions: sum.deletions + (file.stats?.deletions ?? 0),
		}),
		{ additions: 0, deletions: 0 },
	);
	const statWidth = statWidthFor([...files, ...others]);
	const fileCount = files.length;
	const folded = fileCount > MAX_UNFOLDED_FILES && !expanded;
	const shown = folded ? files.slice(0, FOLDED_FILE_COUNT) : files;
	const hiddenCount = fileCount - FOLDED_FILE_COUNT;
	const othersCount = others.length;
	const review =
		filter && openDiff ? (path?: string) => openDiff(filter, path) : undefined;
	const canUndo = Boolean(
		own && newest && turnChanges && changes && !changes.live && !changes.shared,
	);
	const undo = () => {
		setConfirmingUndo(false);
		if (!turnChanges) return;
		setUndoing(true);
		turnChanges
			.undo(
				turnId,
				files.flatMap((file) =>
					file.place.relativePath ? [file.place.relativePath] : [],
				),
				toolCallIds,
			)
			.then(setOutcome, (error: unknown) => {
				console.error("[chat] undo failed", error);
				setOutcome("failed");
			})
			.finally(() => {
				setUndoing(false);
				reload();
			});
	};

	const renderRow = (file: CardFile, rowFilter: DiffPaneFilter | null) => {
		const { relativePath } = file.place;
		return (
			<ChangedFileRow
				key={file.place.absolutePath}
				kind={file.kind}
				onOpen={
					openFile
						? () =>
								openFile(
									file.place.absolutePath,
									false,
									file.line ? { line: file.line } : undefined,
								)
						: undefined
				}
				onReview={
					rowFilter && openDiff && relativePath
						? () => openDiff(rowFilter, relativePath)
						: undefined
				}
				place={file.place}
				stats={file.stats}
				statWidth={statWidth}
			/>
		);
	};

	return (
		<div className="@container/turn-card mt-1 mb-2 overflow-hidden rounded-lg border border-border/60 text-[13px]">
			<div className="flex min-w-0 items-center gap-2 border-border/50 border-b bg-foreground/[0.03] py-1 pr-1.5 pl-3">
				<FileDiff className="size-3.5 shrink-0 text-muted-foreground" />
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="min-w-0 truncate text-foreground/90">
							{own
								? plural(fileCount, {
										one: "Edited # file",
										other: "Edited # files",
									})
								: plural(fileCount, {
										one: "# file changed in this workspace",
										other: "# files changed in this workspace",
									})}
						</span>
					</TooltipTrigger>
					<TooltipContent className="max-w-72">
						{!changes ? (
							<Trans>
								Counted from the agent's file edits. Changes made by shell
								commands, notebook or MCP tools, or subagents are not included,
								and a file edited more than once can count a line twice.
							</Trans>
						) : !own ? (
							<Trans>
								From snapshots of the worktree before and after this turn.
								Another chat worked here at the same time, so some of these
								changes may be its own.
							</Trans>
						) : changes.shared ? (
							<Trans>
								From snapshots of the worktree before and after this turn.
								Another chat worked here at the same time, so this list has only
								the files this chat edited with its file tools. Other changes
								are listed apart.
							</Trans>
						) : (
							<Trans>
								From snapshots of the worktree before and after this turn, so
								edits made by shell commands count too.
							</Trans>
						)}
					</TooltipContent>
				</Tooltip>
				<span
					className="min-w-0 shrink-[100] truncate whitespace-nowrap font-mono text-xs tabular-nums @max-[20rem]/turn-card:hidden"
					data-find-skip
				>
					<DiffStatText
						additions={totals.additions}
						deletions={totals.deletions}
					/>
				</span>
				<div className="ml-auto flex shrink-0 items-center gap-2">
					{canUndo && (
						<Button
							className="h-6 shrink-0 gap-1 px-2 text-muted-foreground text-xs"
							disabled={undoing}
							onClick={() => setConfirmingUndo(true)}
							size="xs"
							variant="ghost"
						>
							<Undo2 className="size-3" />
							<span className="@max-[20rem]/turn-card:sr-only">
								<Trans>Undo</Trans>
							</span>
						</Button>
					)}
					{review && (
						<Button
							className="h-6 shrink-0 px-2 text-xs"
							onClick={() => review()}
							size="xs"
							variant="outline"
						>
							<Trans>Review</Trans>
						</Button>
					)}
				</div>
			</div>
			{outcome && <UndoOutcomeNotice outcome={outcome} />}
			{shown.map((file) => renderRow(file, filter))}
			{fileCount > MAX_UNFOLDED_FILES && (
				<button
					aria-expanded={expanded}
					className="flex w-full items-center gap-1.5 border-border/50 border-t px-3 py-1 text-left text-muted-foreground text-xs transition-colors hover:text-foreground"
					onClick={() => setExpanded((value) => !value)}
					type="button"
				>
					<ChevronDown
						className={cn(
							"size-3 transition-transform",
							expanded && "rotate-180",
						)}
					/>
					{expanded
						? t({ message: "Show fewer files" })
						: plural(hiddenCount, {
								one: "Show # more file",
								other: "Show # more files",
							})}
				</button>
			)}
			{othersCount > 0 && (
				<>
					<button
						aria-expanded={othersOpen}
						className="flex w-full items-center gap-1.5 border-border/50 border-t px-3 py-1 text-left text-muted-foreground text-xs transition-colors hover:text-foreground"
						onClick={() => setOthersOpen((value) => !value)}
						type="button"
					>
						<ChevronDown
							className={cn(
								"size-3 transition-transform",
								othersOpen && "rotate-180",
							)}
						/>
						{plural(othersCount, {
							one: "Also changed in this workspace: # file",
							other: "Also changed in this workspace: # files",
						})}
					</button>
					{othersOpen && (
						<div className="text-muted-foreground">
							{others.map((file) => renderRow(file, othersFilter))}
						</div>
					)}
				</>
			)}
			<DiscardConfirmDialog
				confirmLabel={t({ message: "Undo changes" })}
				description={t({
					message:
						"The chat stays as it is. Files edited since this turn, by anyone, are left alone and listed.",
				})}
				onConfirm={undo}
				onOpenChange={setConfirmingUndo}
				open={confirmingUndo}
				title={t({ message: "Undo the file changes in this card?" })}
			/>
		</div>
	);
}
