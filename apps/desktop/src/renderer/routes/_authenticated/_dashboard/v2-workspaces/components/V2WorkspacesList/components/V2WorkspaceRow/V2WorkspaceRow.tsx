import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { memo, type ReactNode, useEffect, useState } from "react";
import { CgLaptop } from "react-icons/cg";
import {
	LuArchive,
	LuArchiveRestore,
	LuMonitor,
	LuMonitorOff,
	LuPin,
	LuPinOff,
	LuTrash2,
} from "react-icons/lu";
import { WorkspaceNameMarquee } from "renderer/components/WorkspaceNameMarquee";
import { useFocusVisible } from "renderer/hooks/useFocusVisible";
import { pullRequestRefFromUrl } from "renderer/lib/github/pullRequestRef";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import {
	type V2WorkspaceActions,
	V2WorkspaceContextMenu,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/V2WorkspaceContextMenu";
import { V2WorkspaceProjectIcon } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/V2WorkspaceProjectIcon";
import { WorkspaceChecksDot } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/WorkspaceChecksDot";
import { WorkspaceOwnerAvatar } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/WorkspaceOwnerAvatar";
import { WorkspaceStateGlyph } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/WorkspaceStateGlyph";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { workspaceActivityAt } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/sortWorkspaces";
import { CloudGlyph } from "renderer/routes/_authenticated/components/CloudGlyph";
import { PRIcon } from "renderer/screens/main/components/PRIcon/PRIcon";
import { getRelativeTime } from "renderer/screens/main/components/WorkspacesListView/utils";
import { usePullRequestPaneIntent } from "renderer/stores/pull-request-pane-intent";

interface V2WorkspaceRowProps {
	workspace: AccessibleV2Workspace;
	isCurrentRoute: boolean;
}

/** 181909 → "181.9k" — keeps outlier churn from blowing out the stats slot. */
function formatCount(count: number): string {
	if (count < 10_000) return String(count);
	return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

const HOVER_ACTION_CLASS =
	"flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-foreground/10 hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

function RowHoverAction({
	label,
	onClick,
	disabled = false,
	children,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
	children: ReactNode;
}) {
	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<button
					type="button"
					disabled={disabled}
					onClick={(event) => {
						event.stopPropagation();
						onClick();
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.stopPropagation();
						}
					}}
					aria-label={label}
					className={HOVER_ACTION_CLASS}
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent side="top">{label}</TooltipContent>
		</Tooltip>
	);
}

// Memoized: filter/sort changes re-render the whole list, and at hundreds of
// rows (each carrying a context menu, marquee, and tooltips) that costs
// hundreds of ms per menu-checkbox toggle. Workspace object identities are
// stable across those changes, so unchanged rows must skip.
export const V2WorkspaceRow = memo(function V2WorkspaceRow({
	workspace,
	isCurrentRoute,
}: V2WorkspaceRowProps) {
	const { formatDateTime } = useFormat();

	const { t } = useLingui();
	const navigate = useNavigate();
	const isLocalWorkspace = workspace.type === "local";
	const isCloud = workspace.hostType === "cloud";
	const isArchived = workspace.archivedAt != null;
	// The local device is the one running this app — it can't be offline from
	// its own point of view, whatever presence says.
	const isDeviceOffline =
		!workspace.hostIsOnline && workspace.hostType === "remote-device";
	// Drives the name's hover-reveal for keyboard users: the row, not the
	// name span, is what's actually tabbable.
	const {
		isFocusVisible: isFocused,
		onFocus: handleRowFocus,
		onBlur: handleRowBlur,
	} = useFocusVisible();

	// The selected look appears on click, not once the route has changed: a
	// slow route transition otherwise reads as a click that did nothing.
	const [isOpening, setIsOpening] = useState(false);
	useEffect(() => {
		if (!isOpening) return;
		const timeout = setTimeout(() => setIsOpening(false), 2000);
		return () => clearTimeout(timeout);
	}, [isOpening]);

	const creatorLabel = workspace.isCreatedByCurrentUser
		? t({ message: "you" })
		: workspace.createdByName;

	// The visible age tracks activity (matches the sort); creation and
	// last-agent-event details live in the tooltip.
	const timeLabel = getRelativeTime(workspaceActivityAt(workspace), {
		format: "compact",
	});
	const createdAtLabel = formatDateTime(workspace.createdAt, undefined);
	const timeTitle = [
		creatorLabel
			? t({
					message: `Created ${createdAtLabel} by ${creatorLabel}`,
				})
			: t({
					message: `Created ${createdAtLabel}`,
				}),
		workspace.lastAgentEventAt
			? t({
					message: `Last agent activity ${formatDateTime(new Date(workspace.lastAgentEventAt), undefined)}`,
				})
			: null,
	]
		.filter(Boolean)
		.join("\n");

	// The branch stays one hover away rather than taking a slot of its own.
	const rowTitle = [
		workspace.pr
			? t({
					message: `PR #${workspace.pr.prNumber} (${workspace.pr.state})`,
				})
			: null,
		workspace.type !== "session" &&
		workspace.branch.toLowerCase() !== workspace.name.toLowerCase()
			? t({
					message: `Branch: ${workspace.branch}`,
				})
			: null,
	]
		.filter(Boolean)
		.join("\n");

	const whereLabel = isCloud
		? t({ message: "Cloud workspace" })
		: isDeviceOffline
			? t({ message: `${workspace.hostName} — device offline` })
			: workspace.hostName;

	const renderHoverActions = (actions: V2WorkspaceActions) =>
		isArchived ? (
			actions.canRestore ? (
				<RowHoverAction
					label={
						actions.isRestoreBlocked
							? t({ message: `${workspace.hostName} — device offline` })
							: t({ message: "Restore workspace" })
					}
					onClick={actions.restore}
					disabled={actions.isRestoreBlocked}
				>
					<LuArchiveRestore className="size-3.5" />
				</RowHoverAction>
			) : null
		) : (
			<>
				{workspace.isInSidebar ? (
					actions.canRemoveFromSidebar && !isCurrentRoute ? (
						<RowHoverAction
							label={t({ message: "Hide from Sidebar" })}
							onClick={actions.removeFromSidebar}
						>
							<LuPinOff className="size-3.5" />
						</RowHoverAction>
					) : null
				) : (
					<RowHoverAction
						label={t({ message: "Show on Sidebar" })}
						onClick={actions.addToSidebar}
					>
						<LuPin className="size-3.5" />
					</RowHoverAction>
				)}
				<RowHoverAction
					label={
						isCloud
							? t({ message: "Archive workspace" })
							: t({ message: "Delete workspace" })
					}
					onClick={actions.openDeleteDialog}
				>
					{isCloud ? (
						<LuArchive className="size-3.5" />
					) : (
						<LuTrash2 className="size-3.5" />
					)}
				</RowHoverAction>
			</>
		);

	return (
		<V2WorkspaceContextMenu
			workspace={workspace}
			isCurrentRoute={isCurrentRoute}
		>
			{(actions) => (
				// biome-ignore lint/a11y/useSemanticElements: The row contains nested action buttons, so it cannot be a native button.
				<div
					role="button"
					aria-current={isCurrentRoute ? "page" : undefined}
					// An archived row has nothing to open; Restore is its action.
					aria-disabled={isArchived || undefined}
					tabIndex={0}
					onClick={() => {
						if (!isArchived) setIsOpening(true);
						actions.open();
					}}
					onKeyDown={(event) => {
						if (event.target !== event.currentTarget) return;
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							if (!isArchived) setIsOpening(true);
							actions.open();
						}
					}}
					onFocus={handleRowFocus}
					onBlur={handleRowBlur}
					title={rowTitle || undefined}
					className={cn(
						"group flex items-center gap-3 border-b border-border/40 px-6 py-3 text-sm outline-none transition-colors",
						"focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset",
						isArchived ? "cursor-default" : "cursor-pointer",
						isCurrentRoute || isOpening
							? "bg-muted hover:bg-muted focus-visible:bg-muted"
							: "hover:bg-accent/50 focus-visible:bg-accent/50",
					)}
				>
					<WorkspaceStateGlyph workspace={workspace} />

					{isLocalWorkspace ? (
						<Tooltip delayDuration={300}>
							<TooltipTrigger asChild>
								{/* The wrapping span (not the icon itself — react-icons
								    treats a `title` prop as an SVG <title> child, not an
								    HTML attribute, so it can't block inheritance) carries
								    an empty title to stop it from inheriting the row's
								    title (PR/branch); without it, hovering this icon fires
								    both the native tooltip and this Radix one at once. */}
								<span title="">
									<CgLaptop
										className="size-3.5 shrink-0 text-muted-foreground"
										aria-label={t({
											message: "Local workspace",
										})}
									/>
								</span>
							</TooltipTrigger>
							<TooltipContent side="top">
								<Trans>Local workspace</Trans>
							</TooltipContent>
						</Tooltip>
					) : null}

					<WorkspaceNameMarquee
						name={workspace.name}
						forceActive={isFocused}
						className={cn(
							"min-w-0 flex-1 font-medium",
							// Done and dead states recede so live work owns the contrast.
							isArchived ||
								workspace.pr?.state === "merged" ||
								workspace.sandboxStatus === "failed"
								? "text-muted-foreground"
								: "text-foreground",
						)}
					/>

					<span
						className="flex w-32 shrink-0 items-center gap-1.5 text-xs text-muted-foreground @max-3xl:hidden"
						title={workspace.projectName ?? t({ message: "Session" })}
					>
						<V2WorkspaceProjectIcon
							projectName={workspace.projectName ?? t({ message: "Session" })}
							iconUrl={workspace.projectIconUrl}
							size="sm"
							className="size-4 rounded-sm text-[9px]"
						/>
						<span className="min-w-0 truncate">
							{workspace.projectName ?? <Trans>Session</Trans>}
						</span>
					</span>

					<span className="flex w-4 shrink-0 items-center justify-center">
						<WorkspaceOwnerAvatar workspace={workspace} />
					</span>

					{workspace.pr ? (
						<button
							type="button"
							onClick={(event) => {
								event.stopPropagation();
								if (!workspace.pr) return;
								// Opens the PR pane inside the workspace instead of GitHub;
								// an archived workspace has no pane to open, so GitHub it is.
								const ref = isArchived
									? null
									: pullRequestRefFromUrl(workspace.pr.url);
								if (!ref) {
									window.open(workspace.pr.url, "_blank");
									return;
								}
								usePullRequestPaneIntent.getState().request({
									workspaceId: workspace.id,
									...ref,
								});
								void navigateToV2Workspace(workspace.id, navigate);
							}}
							aria-label={t({
								message: `Pull request #${workspace.pr.prNumber}, ${workspace.pr.state}`,
							})}
							className="flex shrink-0 items-center gap-1 rounded text-[11px] tabular-nums text-muted-foreground hover:text-foreground"
						>
							<PRIcon state={workspace.pr.state} className="size-3.5" />
							<span className="@max-2xl:hidden">#{workspace.pr.prNumber}</span>
							<WorkspaceChecksDot
								status={workspace.pr.checksStatus}
								checks={workspace.pr.checks}
							/>
						</button>
					) : null}

					{workspace.diffStats &&
					(workspace.diffStats.additions > 0 ||
						workspace.diffStats.deletions > 0) ? (
						<span
							className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] tabular-nums leading-none @max-lg:hidden"
							title={t({
								message: plural(workspace.diffStats.fileCount, {
									one: "# changed file",
									other: "# changed files",
								}),
							})}
						>
							<span className="text-emerald-600/80 dark:text-emerald-400/70">
								+{formatCount(workspace.diffStats.additions)}
							</span>
							<span className="text-red-600/80 dark:text-red-400/70">
								−{formatCount(workspace.diffStats.deletions)}
							</span>
						</span>
					) : null}

					{/* Where + age; hover swaps in the row's actions in place, so
					    the slot keeps one width either way. */}
					<span className="grid w-[4.5rem] shrink-0 items-center justify-items-end [&>*]:col-start-1 [&>*]:row-start-1">
						<span
							className={cn(
								"flex items-center gap-1.5 text-xs text-muted-foreground",
								"group-hover:invisible group-focus-within:invisible",
								isDeviceOffline && "text-muted-foreground/60",
							)}
						>
							{workspace.hostType !== "local-device" ? (
								<span
									title={whereLabel}
									className="flex shrink-0 items-center text-muted-foreground/70"
								>
									{isCloud ? (
										<CloudGlyph className="size-3" />
									) : isDeviceOffline ? (
										<LuMonitorOff className="size-3" strokeWidth={2} />
									) : (
										<LuMonitor className="size-3" strokeWidth={2} />
									)}
									<span className="sr-only">{whereLabel}</span>
								</span>
							) : null}
							<span
								className="whitespace-nowrap tabular-nums"
								title={timeTitle}
							>
								{timeLabel}
							</span>
						</span>
						<span className="hidden items-center gap-1 group-hover:flex group-focus-within:flex">
							{renderHoverActions(actions)}
						</span>
					</span>
				</div>
			)}
		</V2WorkspaceContextMenu>
	);
});
