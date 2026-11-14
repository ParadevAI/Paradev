import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { formatList } from "@superset/i18n/format";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { ChevronRight, Minus, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { LuUndo2 } from "react-icons/lu";
import { DiffStatText } from "renderer/routes/_authenticated/_dashboard/components/DiffStatText";
import { DiscardConfirmDialog } from "renderer/routes/_authenticated/_dashboard/components/DiscardConfirmDialog";
import { checkoutInput } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/checkoutInput";
import {
	useV2ChangesSectionsStore,
	type V2ChangesSectionKey,
} from "renderer/stores/v2-changes-sections";

type SectionKind = "unstaged" | "staged";

interface ChangesSectionProps {
	sectionKey: V2ChangesSectionKey;
	/** The checkouts with files in the section; the bulk actions act on each. */
	repositoryIds: Array<string | undefined>;
	/** Set when the list shows several repositories, for the confirm copy. */
	repositoryNames?: string[];
	title: string;
	count: number;
	/** Section-wide +/− totals, right-aligned on the header. */
	additions?: number;
	deletions?: number;
	stagingActions?: {
		kind: SectionKind;
		workspaceId: string;
	};
	children: ReactNode;
}

export function ChangesSection({
	sectionKey,
	repositoryIds,
	repositoryNames,
	title,
	count,
	additions = 0,
	deletions = 0,
	stagingActions,
	children,
}: ChangesSectionProps) {
	const { t } = useLingui();
	const repositoryName =
		repositoryNames && repositoryNames.length > 0
			? formatList(repositoryNames)
			: undefined;
	const collapsed = useV2ChangesSectionsStore(
		(state) => state.collapsed[sectionKey] ?? false,
	);
	const setCollapsed = useV2ChangesSectionsStore((state) => state.setCollapsed);
	const open = !collapsed;
	const [showConfirm, setShowConfirm] = useState(false);
	const utils = workspaceTrpc.useUtils();

	const invalidate = (
		_data: unknown,
		scope: { workspaceId: string; repositoryId?: string },
	) => {
		const input = checkoutInput(scope.workspaceId, scope.repositoryId);
		void utils.git.getStatus.invalidate(input);
		void utils.git.getDiff.invalidate(input);
	};

	const discardAllUnstaged = workspaceTrpc.git.discardAllUnstaged.useMutation({
		onSuccess: invalidate,
		onError: (err) => {
			toast.error(
				t({
					message: "Couldn't discard unstaged changes",
				}),
				{
					description: errorMessage(err),
				},
			);
		},
	});
	const discardAllStaged = workspaceTrpc.git.discardAllStaged.useMutation({
		onSuccess: invalidate,
		onError: (err) => {
			toast.error(
				t({
					message: "Couldn't discard staged changes",
				}),
				{
					description: errorMessage(err),
				},
			);
		},
	});
	const stageAll = workspaceTrpc.git.stageAll.useMutation({
		onSuccess: invalidate,
		onError: (err) => {
			toast.error(
				t({
					message: "Couldn't stage changes",
				}),
				{ description: errorMessage(err) },
			);
		},
	});
	const unstageAll = workspaceTrpc.git.unstageAll.useMutation({
		onSuccess: invalidate,
		onError: (err) => {
			toast.error(
				t({
					message: "Couldn't unstage changes",
				}),
				{
					description: errorMessage(err),
				},
			);
		},
	});

	if (count === 0) return null;

	const runDiscardAll = () => {
		if (!stagingActions) return;
		const { kind, workspaceId } = stagingActions;
		const discard = kind === "unstaged" ? discardAllUnstaged : discardAllStaged;
		for (const repositoryId of repositoryIds) {
			discard.mutate(checkoutInput(workspaceId, repositoryId));
		}
	};

	const runStagingToggle = () => {
		if (!stagingActions) return;
		const { kind, workspaceId } = stagingActions;
		const toggle = kind === "unstaged" ? stageAll : unstageAll;
		for (const repositoryId of repositoryIds) {
			toggle.mutate(checkoutInput(workspaceId, repositoryId));
		}
	};

	const dialogCopy =
		stagingActions?.kind === "unstaged"
			? {
					title: repositoryName
						? t({
								message: `Discard all unstaged changes in ${repositoryName}?`,
							})
						: t({
								message: "Discard all unstaged changes?",
							}),
					description: t({
						message:
							"This will revert all unstaged modifications and delete untracked files. This cannot be undone.",
					}),
				}
			: {
					title: repositoryName
						? t({
								message: `Discard all staged changes in ${repositoryName}?`,
							})
						: t({
								message: "Discard all staged changes?",
							}),
					description: t({
						message:
							"This will unstage and revert all staged changes. Staged new files will be deleted. This cannot be undone.",
					}),
				};

	const isUnstaged = stagingActions?.kind === "unstaged";
	const stagingToggleLabel = isUnstaged
		? t({ message: "Stage all" })
		: t({ message: "Unstage all" });
	const StagingToggleIcon = isUnstaged ? Plus : Minus;

	return (
		<Collapsible
			open={open}
			onOpenChange={(next) => setCollapsed(sectionKey, !next)}
		>
			<div className="flex items-center">
				<CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left text-xs hover:bg-accent/30">
					<ChevronRight
						className={cn(
							"size-3 shrink-0 text-muted-foreground transition-transform duration-150",
							open && "rotate-90",
						)}
					/>
					<span className="truncate font-medium">{title}</span>
					<span className="shrink-0 text-[10px] text-muted-foreground">
						{count}
					</span>
					{(additions > 0 || deletions > 0) && (
						<span className="ml-auto shrink-0 pl-2 text-[10px] tabular-nums">
							<DiffStatText additions={additions} deletions={deletions} />
						</span>
					)}
				</CollapsibleTrigger>
				{stagingActions && (
					<div className="flex shrink-0 items-center gap-0.5 pr-1.5">
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label={
										stagingActions.kind === "unstaged"
											? t({
													message: "Discard all unstaged changes",
												})
											: t({
													message: "Discard all staged changes",
												})
									}
									onClick={() => setShowConfirm(true)}
									className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-destructive"
								>
									<LuUndo2 className="size-3.5" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								<Trans>Discard all {stagingActions.kind}</Trans>
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label={stagingToggleLabel}
									onClick={runStagingToggle}
									className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
								>
									<StagingToggleIcon className="size-3.5" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								{stagingToggleLabel}
							</TooltipContent>
						</Tooltip>
					</div>
				)}
			</div>
			<CollapsibleContent>{children}</CollapsibleContent>
			{stagingActions && (
				<DiscardConfirmDialog
					open={showConfirm}
					onOpenChange={setShowConfirm}
					title={dialogCopy.title}
					description={dialogCopy.description}
					onConfirm={() => {
						setShowConfirm(false);
						runDiscardAll();
					}}
				/>
			)}
		</Collapsible>
	);
}
