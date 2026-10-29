import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { Popover, PopoverAnchor, PopoverContent } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { useMemo, useRef, useState } from "react";
import { LuArrowUpRight } from "react-icons/lu";
import {
	VscChevronDown,
	VscGitCommit,
	VscGitMerge,
	VscGitPullRequest,
	VscLoading,
	VscRepoPush,
} from "react-icons/vsc";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { usePullRequestLinkPolicy } from "renderer/lib/clickPolicy";
import {
	type OpenPullRequestPane,
	openPullRequestLink,
} from "renderer/lib/github/openPullRequestLink";
import type { PullRequestTarget } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestClient";
import { computeChecksRollup } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/computeChecksStatus";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { PRIcon, type PRState } from "renderer/screens/main/components/PRIcon";
import { usePullRequestActions } from "../../../../hooks/usePullRequestActions";
import { useShipActions } from "../../../../hooks/useShipActions";
import type { PRFlowState } from "../../../../utils/getPRFlowState";
import { CommitForm } from "../../../CommitForm";
import { PRStatusIndicators } from "../../../PRStatusIndicators";
import { PRDetailCard } from "./components/PRDetailCard";

interface PRStatusGroupProps {
	state: PRFlowState;
	workspaceId: string;
	onRefresh?: () => void;
	/** Whether a Changes pane is in view — the face reads as pressed. */
	isChangesOpen: boolean;
	/** Accessible name for the face's toggle ("Open changes" / "Close changes"). */
	toggleLabel: string;
	/**
	 * Toggles the Changes pane — the badge's main click, since it replaced
	 * the diff-stat pill as the control's face once a PR exists.
	 */
	onToggleChanges: () => void;
	/** Opens the PR's summary pane in the workspace (the menu's "Open pull request"). */
	onOpenPullRequest: OpenPullRequestPane;
}

/**
 * Tab-bar PR badge — status icon + number + compact CI/review indicators,
 * with a dropdown for committing and pushing work the PR doesn't have yet,
 * merge actions (open, non-draft PRs), marking a draft ready for review, the
 * PR summary pane, and a GitHub link.
 * Clicking the badge toggles the Changes pane. Hovering surfaces a rich detail popover (title,
 * branch, CI summary, last activity).
 *
 * Indicators are suppressed past `open`/`queued` since post-merge CI/review
 * state is historical noise.
 */
export function PRStatusGroup({
	state,
	workspaceId,
	onRefresh,
	isChangesOpen,
	toggleLabel,
	onToggleChanges,
	onOpenPullRequest,
}: PRStatusGroupProps) {
	const { t } = useLingui();
	const { workspace } = useWorkspace();
	const organizationId = useActiveOrganizationId();
	const linkPolicy = usePullRequestLinkPolicy();
	const isSession = workspace.type === "session";
	const pr =
		state.kind === "pr-exists"
			? state.pr
			: state.kind === "busy" || state.kind === "error"
				? state.pr
				: null;

	const target: PullRequestTarget | null = pr
		? {
				organizationId,
				repoFullName: `${pr.repoOwner}/${pr.repoName}`,
				prNumber: pr.number,
			}
		: null;
	const prActions = usePullRequestActions({ workspaceId, target, onRefresh });

	const sync = state.kind === "pr-exists" ? state.sync : null;
	const canCommit = sync?.hasUncommitted === true;
	const canPush = sync != null && (!sync.hasUpstream || sync.pushCount > 0);
	const [isCommitFormOpen, setIsCommitFormOpen] = useState(false);
	// The menu reclaims focus through its exit animation, so a popover opened
	// from the item's click would lose focus and close. Open it once the menu
	// has finished closing.
	const commitRequestedRef = useRef(false);
	const shipActions = useShipActions({
		workspaceId,
		onRefresh: () => onRefresh?.(),
		isPrFormOpen: false,
		onCommitted: () => setIsCommitFormOpen(false),
		onPrCreated: () => {},
		enabled: false,
	});

	const checks = useMemo(
		() => (pr ? computeChecksRollup(pr.checks) : null),
		[pr],
	);

	if (!pr || !checks) return null;

	const linkState = pr.isDraft
		? "draft"
		: pr.state === "merged"
			? "merged"
			: pr.state === "closed"
				? "closed"
				: pr.state === "queued"
					? "queued"
					: "open";
	const canMerge = pr.state === "open" && !pr.isDraft;
	// A closed/merged draft can't transition to ready — GitHub rejects it.
	const canMarkReady =
		linkState === "draft" && pr.state !== "closed" && pr.state !== "merged";
	// Queued PRs are still actively running checks, so keep CI/review indicators.
	const showIndicators = pr.state === "open" || pr.state === "queued";

	const isBusy =
		prActions.isMerging ||
		prActions.isMarkingReady ||
		shipActions.isCommitting ||
		shipActions.isPushing;
	const tint = stateTintClasses(linkState);

	const badgeContent = (
		<>
			<PRIcon state={linkState} className="size-4" />
			{/* The number brightens while pressed — the state tint alone moves
			    the fill too little to read as a toggle. */}
			<span
				className={cn(
					"font-mono text-xs",
					isChangesOpen ? "text-foreground" : "text-muted-foreground",
				)}
			>
				#{pr.number}
			</span>
			{showIndicators && <PRStatusIndicators checks={checks} />}
		</>
	);
	const badgeClass = cn(
		"flex h-full items-center gap-1 px-1.5 outline-none transition-colors",
		tint.hover,
		isChangesOpen && tint.pressed,
	);

	return (
		// A segment of ChangesControl's split button — the parent owns the
		// border and rounding; the state tint lives in this segment's fill.
		<Popover
			open={isCommitFormOpen}
			onOpenChange={(open) => {
				if (!open) setIsCommitFormOpen(false);
			}}
		>
			<PopoverAnchor asChild>
				<div
					className={cn("flex items-center", tint.container)}
					aria-busy={isBusy}
				>
					<HoverCard openDelay={150} closeDelay={120}>
						<HoverCardTrigger asChild>
							<button
								type="button"
								className={badgeClass}
								aria-pressed={isChangesOpen}
								// The visible text is only the PR number; name the action
								// and keep the number so the badge is still identifiable.
								aria-label={`${toggleLabel}, #${pr.number}`}
								onClick={onToggleChanges}
							>
								{badgeContent}
							</button>
						</HoverCardTrigger>
						<HoverCardContent
							align="end"
							sideOffset={8}
							className="w-80 overflow-hidden p-0"
						>
							<PRDetailCard pr={pr} checks={checks} linkState={linkState} />
						</HoverCardContent>
					</HoverCard>

					<div className={cn("h-full w-px", tint.divider)} />
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className={cn(
									"flex h-full items-center outline-none transition-colors",
									"px-1",
									tint.hover,
								)}
								disabled={isBusy}
								aria-label={
									prActions.isMerging
										? t({
												message: "Merging pull request",
											})
										: t({
												message: "Open pull request options",
											})
								}
							>
								{isBusy ? (
									<VscLoading className="size-3 animate-spin text-muted-foreground" />
								) : (
									<VscChevronDown className="size-3 text-muted-foreground" />
								)}
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="end"
							className="w-44"
							onCloseAutoFocus={(event) => {
								if (!commitRequestedRef.current) return;
								commitRequestedRef.current = false;
								event.preventDefault();
								setIsCommitFormOpen(true);
							}}
						>
							{(canCommit || canPush) && (
								<>
									{canCommit && (
										<DropdownMenuItem
											className="text-xs"
											onClick={() => {
												commitRequestedRef.current = true;
											}}
										>
											<VscGitCommit className="size-3.5" />
											<Trans>Commit</Trans>
										</DropdownMenuItem>
									)}
									{canPush && (
										<DropdownMenuItem
											className="text-xs"
											onClick={shipActions.push}
										>
											<VscRepoPush className="size-3.5" />
											<Trans>Push</Trans>
										</DropdownMenuItem>
									)}
									<DropdownMenuSeparator />
								</>
							)}
							{canMarkReady && (
								<>
									<DropdownMenuItem
										className="text-xs"
										disabled={prActions.isMarkingReady}
										onClick={prActions.markReady}
									>
										<VscGitPullRequest className="size-3.5" />
										<Trans>Ready for review</Trans>
									</DropdownMenuItem>
									<DropdownMenuSeparator />
								</>
							)}
							{canMerge && (
								<>
									<DropdownMenuLabel
										className={cn(
											"font-normal text-muted-foreground",
											"text-xs",
										)}
									>
										<Trans>Merge</Trans>
									</DropdownMenuLabel>
									<DropdownMenuItem
										onClick={() => prActions.merge("squash")}
										className="text-xs"
										disabled={prActions.isMerging}
									>
										<VscGitMerge className="size-3.5" />
										<Trans>Squash and merge</Trans>
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={() => prActions.merge("merge")}
										className="text-xs"
										disabled={prActions.isMerging}
									>
										<VscGitMerge className="size-3.5" />
										<Trans>Create merge commit</Trans>
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={() => prActions.merge("rebase")}
										className="text-xs"
										disabled={prActions.isMerging}
									>
										<VscGitMerge className="size-3.5" />
										<Trans>Rebase and merge</Trans>
									</DropdownMenuItem>
									<DropdownMenuSeparator />
								</>
							)}
							{!isSession && (
								<DropdownMenuItem
									className="text-xs"
									onClick={(event) =>
										openPullRequestLink(
											pr.url,
											linkPolicy.getAction(event),
											onOpenPullRequest,
										)
									}
								>
									<VscGitPullRequest className="size-3.5" />
									<Trans>Open pull request</Trans>
								</DropdownMenuItem>
							)}
							<DropdownMenuItem asChild className="text-xs">
								<a href={pr.url} target="_blank" rel="noopener noreferrer">
									<LuArrowUpRight className="size-3.5" />
									<Trans>View on GitHub</Trans>
								</a>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</PopoverAnchor>
			<PopoverContent align="end" sideOffset={8} className="w-80 p-3">
				<CommitForm actions={shipActions} />
			</PopoverContent>
		</Popover>
	);
}

/**
 * State-tinted styling for the PR badge segment. Mirrors the PRIcon color
 * palette so the whole segment reads as "open"/"draft"/etc. at a glance,
 * not just the icon.
 */
function stateTintClasses(state: PRState): {
	container: string;
	hover: string;
	/** Face fill while the Changes pane it toggles is in view. */
	pressed: string;
	divider: string;
} {
	switch (state) {
		case "open":
			return {
				container: "bg-emerald-500/10",
				hover: "hover:bg-emerald-500/15 focus-visible:bg-emerald-500/15",
				pressed: "bg-emerald-500/20",
				divider: "bg-emerald-500/30",
			};
		case "merged":
			return {
				container: "bg-violet-500/10",
				hover: "hover:bg-violet-500/15 focus-visible:bg-violet-500/15",
				pressed: "bg-violet-500/20",
				divider: "bg-violet-500/30",
			};
		case "closed":
			return {
				container: "bg-rose-500/10",
				hover: "hover:bg-rose-500/15 focus-visible:bg-rose-500/15",
				pressed: "bg-rose-500/20",
				divider: "bg-rose-500/30",
			};
		case "draft":
			return {
				container: "bg-muted/40",
				hover: "hover:bg-muted/60 focus-visible:bg-muted/60",
				pressed: "bg-muted/70",
				divider: "bg-border",
			};
		case "queued":
			return {
				container: "bg-amber-500/10",
				hover: "hover:bg-amber-500/15 focus-visible:bg-amber-500/15",
				pressed: "bg-amber-500/20",
				divider: "bg-amber-500/30",
			};
	}
}
