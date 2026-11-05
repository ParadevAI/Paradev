import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { X } from "lucide-react";
import { useIsInTitleBarShell } from "renderer/routes/_authenticated/_dashboard/providers/TitleBarSlotsProvider";
import type { ChangesPillStats } from "../../../../utils/changesPillStats";
import { ChangesStats } from "../../../ChangesStats";
import {
	type SelectedDiffTarget,
	useChangesTab,
} from "../../../WorkspaceSidebar/hooks/useChangesTab";

interface ChangesRailPanelProps {
	workspaceId: string;
	stats: ChangesPillStats;
	selectedDiffTarget?: SelectedDiffTarget;
	onSelectFile: (
		path: string,
		openInNewTab?: boolean,
		changeKey?: string,
	) => void;
	onOpenFile: (absolutePath: string, openInNewTab?: boolean) => void;
	onHide: () => void;
}

export function ChangesRailPanel({
	workspaceId,
	stats,
	selectedDiffTarget,
	onSelectFile,
	onOpenFile,
	onHide,
}: ChangesRailPanelProps) {
	const { t } = useLingui();
	const changesTab = useChangesTab({
		workspaceId,
		selectedDiffTarget,
		onSelectFile,
		onOpenFile,
	});
	const hideLabel = t({ message: "Hide changed files" });
	const isInTitleBarShell = useIsInTitleBarShell();

	return (
		<aside
			aria-label={t({ message: "Changed files" })}
			className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background"
		>
			<div
				className={cn(
					"flex shrink-0 items-center gap-2 pr-2 pl-3 text-xs",
					isInTitleBarShell
						? "h-7 border-b border-border/20 bg-muted/30"
						: "h-12 bg-muted/45 shadow-[inset_0_-1px_0_var(--border)] dark:bg-muted/35",
				)}
			>
				<span className="truncate font-medium text-foreground">
					<Trans>Changed files</Trans>
				</span>
				<span className="flex items-center gap-1 text-muted-foreground">
					<ChangesStats stats={stats} />
				</span>
				<Tooltip delayDuration={500}>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label={hideLabel}
							onClick={onHide}
							className="ml-auto flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
						>
							<X className="size-3.5" strokeWidth={1.5} />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">{hideLabel}</TooltipContent>
				</Tooltip>
			</div>
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				{changesTab.content}
			</div>
		</aside>
	);
}
