import { Trans } from "@lingui/react/macro";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { GoGitBranch } from "react-icons/go";
import { useParadevShell } from "renderer/hooks/useParadevShell";
import {
	FORM_PICKER_MENU_CLASS,
	FormPickerTrigger,
} from "renderer/routes/_authenticated/components/FormPickerTrigger";
import { PickerChevron } from "../../../components/PickerChevron";
import type { BranchFilter, BranchRow } from "../../../hooks/useBranchContext";
import { BranchCommand } from "../BranchCommand";
import { BranchLoadFailure } from "../BranchLoadFailure";
import {
	type OpenWorkspaceTarget,
	toOpenWorkspaceTarget,
} from "./openWorkspaceTarget";

interface CompareBaseBranchPickerProps {
	effectiveCompareBaseBranch: string | null;
	defaultBranch: string | null | undefined;
	isBranchesLoading: boolean;
	isBranchesError: boolean;
	branchesError: unknown;
	isBranchesRefetching: boolean;
	onRetryBranches: () => void;
	onChangeProjectLocation?: () => void;
	isHostOffline: boolean;
	branches: BranchRow[];
	branchSearch: string;
	onBranchSearchChange: (value: string) => void;
	branchFilter: BranchFilter;
	onBranchFilterChange: (filter: BranchFilter) => void;
	isFetchingNextPage: boolean;
	hasNextPage: boolean;
	onLoadMore: () => void;
	onSelectCompareBaseBranch: (
		branchName: string,
		source: "local" | "remote-tracking",
	) => void;
	// Server's workspaces.create resolves between open-tracked, adopt-foreign-
	// worktree, and fresh-create. Worktree rows must carry their path so stale
	// branch labels do not make the server create a new managed worktree.
	onOpenWorkspace: (target: OpenWorkspaceTarget) => void;
	/** Set when a base branch cannot be picked for this project; shown as a tooltip. */
	disabledReason?: string;
}

export function CompareBaseBranchPicker({
	effectiveCompareBaseBranch,
	defaultBranch,
	isBranchesLoading,
	isBranchesError,
	branchesError,
	isBranchesRefetching,
	onRetryBranches,
	onChangeProjectLocation,
	isHostOffline,
	branches,
	branchSearch,
	onBranchSearchChange,
	branchFilter,
	onBranchFilterChange,
	isFetchingNextPage,
	hasNextPage,
	onLoadMore,
	onSelectCompareBaseBranch,
	onOpenWorkspace,
	disabledReason,
}: CompareBaseBranchPickerProps) {
	const isParadevShell = useParadevShell();
	const [open, setOpen] = useState(false);
	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) onBranchSearchChange("");
	};

	if (disabledReason) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="inline-flex max-w-full">
						<FormPickerTrigger disabled className="max-w-full">
							<GoGitBranch
								className={
									isParadevShell ? "size-3.5 shrink-0" : "size-3 shrink-0"
								}
							/>
							<span className="truncate">
								<Trans>Default branch</Trans>
							</span>
							<PickerChevron />
						</FormPickerTrigger>
					</span>
				</TooltipTrigger>
				<TooltipContent>{disabledReason}</TooltipContent>
			</Tooltip>
		);
	}

	if (isHostOffline) {
		return (
			<span className="truncate text-[11px] text-muted-foreground">
				<Trans>Host is offline</Trans>
			</span>
		);
	}

	const branchesFailure = (
		<BranchLoadFailure
			error={branchesError}
			isRetrying={isBranchesRefetching}
			onRetry={onRetryBranches}
			onChangeProjectLocation={onChangeProjectLocation}
		/>
	);

	if (isBranchesError && branches.length === 0 && !open) {
		return branchesFailure;
	}

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<FormPickerTrigger
					disabled={isBranchesLoading && branches.length === 0}
					className="max-w-full"
				>
					<GoGitBranch
						className={isParadevShell ? "size-3.5 shrink-0" : "size-3 shrink-0"}
					/>
					{isBranchesLoading && branches.length === 0 ? (
						<span className="h-2.5 w-14 rounded-sm bg-muted-foreground/15 animate-pulse" />
					) : effectiveCompareBaseBranch ? (
						<span className="font-mono truncate">
							{effectiveCompareBaseBranch}
						</span>
					) : (
						<span className="truncate text-muted-foreground/80">
							<Trans>Select base branch…</Trans>
						</span>
					)}
					<PickerChevron />
				</FormPickerTrigger>
			</PopoverTrigger>
			<PopoverContent
				className={`w-[440px] p-0 ${FORM_PICKER_MENU_CLASS}`}
				align="start"
				onWheel={(event) => event.stopPropagation()}
			>
				<BranchCommand
					branches={branches}
					defaultBranch={defaultBranch}
					selectedBranch={effectiveCompareBaseBranch}
					search={branchSearch}
					onSearchChange={onBranchSearchChange}
					filter={branchFilter}
					onFilterChange={onBranchFilterChange}
					isLoading={isBranchesLoading}
					isError={isBranchesError}
					failure={branchesFailure}
					hasNextPage={hasNextPage}
					isFetchingNextPage={isFetchingNextPage}
					onLoadMore={onLoadMore}
					onSelect={(branch) => {
						// Carry the row's locality through so the server doesn't
						// re-resolve and risk picking a stale cached remote ref.
						onSelectCompareBaseBranch(
							branch.name,
							branch.isLocal ? "local" : "remote-tracking",
						);
						handleOpenChange(false);
					}}
					onOpenWorkspace={(branch) => {
						onOpenWorkspace(toOpenWorkspaceTarget(branch));
						handleOpenChange(false);
					}}
				/>
			</PopoverContent>
		</Popover>
	);
}
