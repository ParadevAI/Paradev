import { Trans, useLingui } from "@lingui/react/macro";
import type { WorkspaceStore } from "@superset/panes";
import { Popover, PopoverAnchor, PopoverContent } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { ArrowLeft, GitCompareArrows, ListTree } from "lucide-react";
import {
	type MouseEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { env } from "renderer/env.renderer";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import {
	usePagePolicy,
	usePullRequestLinkPolicy,
} from "renderer/lib/clickPolicy";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	type OpenPullRequestPane,
	openPullRequestLink,
} from "renderer/lib/github/openPullRequestLink";
import { clearTerminalBackgroundMarker } from "renderer/lib/terminal/terminal-background-intents";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { usePageFavorites } from "renderer/routes/_authenticated/_dashboard/hooks/usePageFavorites";
import { usePagesList } from "renderer/routes/_authenticated/_dashboard/hooks/usePagesList";
import { pagesListInput } from "renderer/routes/_authenticated/_dashboard/utils/pagesListInput";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { PRIcon } from "renderer/screens/main/components/PRIcon";
import type { StoreApi } from "zustand/vanilla";
import type { CreateNewAgentSession } from "../../hooks/useAgentSessionLauncher";
import { usePRFlowState } from "../../hooks/usePRFlowState";
import { usePullRequestActions } from "../../hooks/usePullRequestActions";
import { useShipActions } from "../../hooks/useShipActions";
import { useRightPaneLinkTarget } from "../../providers/RightPaneLinkTargetProvider";
import { useWorkspaceGitStatus } from "../../providers/WorkspaceGitStatusProvider";
import type { PagePaneData, PaneViewerData } from "../../types";
import {
	BACKGROUND_TERMINAL_ATTACHMENT_DEBOUNCE_MS,
	getAttachedTerminalIdsKey,
	getBackgroundTerminalRefetchInterval,
	getBackgroundTerminalSessions,
	parseAttachedTerminalIdsKey,
} from "../../utils/backgroundTerminals";
import { changesPillStats } from "../../utils/changesPillStats";
import { computeChecksRollup } from "../../utils/computeChecksStatus";
import { focusOrAddTerminalPane } from "../../utils/focusTerminalPane";
import { getShipMenuActions } from "../../utils/getShipMenuActions";
import { openPagePaneInStore } from "../../utils/openPagePaneInStore";
import { ChangesStats } from "../ChangesStats";
import { CommitForm } from "../CommitForm";
import { CreatePrForm } from "../CreatePrForm";
import { NewPageComposer } from "../NewPageComposer";
import { PRStatusIndicators } from "../PRStatusIndicators";
import { ActivityMenuHeader } from "./components/ActivityMenuHeader";
import { AgentWorkRow } from "./components/AgentWorkRow";
import { AnimatedHeight } from "./components/AnimatedHeight";
import { BackgroundWorkRow } from "./components/BackgroundWorkRow";
import { ChangesMenuRow } from "./components/ChangesMenuRow";
import { FinishedSubagentRow } from "./components/FinishedSubagentRow";
import { MenuGroup } from "./components/MenuGroup";
import { PagesMenuRow } from "./components/PagesMenuRow";
import {
	type PullRequestEntry,
	PullRequestRow,
} from "./components/PullRequestRow";
import { ShipActionsMenu, type ShipView } from "./components/ShipActionsMenu";
import {
	PANEL_EXIT_MS,
	PANEL_MAX_HEIGHT_PX,
	VIEW_ENTER_CLASSNAME,
} from "./constants";
import { useAgentWork } from "./hooks/useAgentWork";
import { useAgentWorkActions } from "./hooks/useAgentWorkActions";
import { useWorkspacePullRequests } from "./hooks/useWorkspacePullRequests";
import { useActivityPanelStore } from "./stores/activityPanelStore";
import {
	usePagesMenuSeenAt,
	usePagesMenuSeenStore,
} from "./stores/pagesMenuSeenStore";
import type { AgentWork } from "./utils/collectAgentWork";
import {
	type BackgroundWork,
	collectBackgroundWork,
} from "./utils/collectBackgroundWork";
import { paneSourceTitle } from "./utils/paneSourceTitle";
import {
	pullRequestDisplayState,
	showsChecks,
} from "./utils/pullRequestDisplayState";
import { type MenuPage, selectMenuPages } from "./utils/selectMenuPages";

const MENU_PAGE_LIMIT = 200;
const CLOCK_TICK_MS = 1000;

interface WorkspaceActivityMenuProps {
	workspaceId: string;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	linkedStores: readonly StoreApi<WorkspaceStore<PaneViewerData>>[];
	isLayoutReady: boolean;
	onOpenPage: (page: PagePaneData, placement: "split" | "tab") => void;
	onCreateNewAgentSession: CreateNewAgentSession;
	onFocusAgentTerminal: (terminalId: string) => void;
	onOpenPullRequest: OpenPullRequestPane;
	changes?: { isOpen: boolean; onToggle: () => void };
}

export function WorkspaceActivityMenu({
	workspaceId,
	store,
	linkedStores,
	isLayoutReady,
	onOpenPage,
	onCreateNewAgentSession,
	onFocusAgentTerminal,
	onOpenPullRequest,
	changes,
}: WorkspaceActivityMenuProps) {
	const { t } = useLingui();
	const paneAreaStyle = changes != null;
	const { favoritePageIds } = usePageFavorites();
	const gitStatus = useWorkspaceGitStatus();
	const changesStats = useMemo(
		() => (gitStatus.data ? changesPillStats(gitStatus.data) : null),
		[gitStatus.data],
	);
	const triggerChangesStats =
		paneAreaStyle && changesStats && changesStats.fileCount > 0
			? changesStats
			: null;
	const { workspace: currentWorkspace } = useWorkspace();
	const [shipView, setShipView] = useState<ShipView | null>(null);
	const [popoverOpen, setPopoverOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const anchorNode = useActivityPanelStore(
		(state) => state.anchorNodes[workspaceId],
	);
	const asideNode = useActivityPanelStore(
		(state) => state.asideNodes[workspaceId],
	);
	const fits = useActivityPanelStore(
		(state) => state.fits[workspaceId] === true,
	);
	const hidden = useActivityPanelStore(
		(state) => state.hidden[workspaceId] === true,
	);
	const setHidden = useActivityPanelStore((state) => state.setHidden);
	const docked = fits && !hidden;
	const floating = popoverOpen && !fits;
	const open = docked || floating;
	const [dockedMounted, setDockedMounted] = useState(docked);
	if (docked && !dockedMounted) setDockedMounted(true);
	useEffect(() => {
		if (docked) return;
		const timer = setTimeout(() => setDockedMounted(false), PANEL_EXIT_MS);
		return () => clearTimeout(timer);
	}, [docked]);
	const panelId = `workspace-activity-${workspaceId}`;
	const newPageStatusId = useId();
	const {
		flowState,
		sync: branchSync,
		onRetry: refreshFlowState,
	} = usePRFlowState(workspaceId, {
		enabled: paneAreaStyle,
	});
	const currentPr =
		flowState.kind === "pr-exists" ||
		flowState.kind === "busy" ||
		flowState.kind === "error"
			? flowState.pr
			: null;
	const currentPrState = currentPr ? pullRequestDisplayState(currentPr) : null;
	const currentPrChecks = useMemo(
		() => (currentPr ? computeChecksRollup(currentPr.checks) : null),
		[currentPr],
	);
	const shipActions = useShipActions({
		workspaceId,
		onRefresh: refreshFlowState,
		isPrFormOpen: shipView === "pr",
		enabled: paneAreaStyle && open,
		onCommitted: () => setShipView(null),
		onPrCreated: () => setShipView(null),
	});
	const shipMenu = getShipMenuActions({
		flowState,
		sync: branchSync,
		workspaceCanCreatePr: shipActions.canCreatePr,
		commitsLoaded: shipActions.commitsLoaded,
	});

	const shipMenuProps = {
		canCommit: shipMenu.canCommit,
		canPush: shipMenu.canPush,
		hasCommitsAhead: shipActions.hasCommitsAhead,
		isBusy: shipActions.isShipping || shipActions.isCommitting,
		onOpenView: (view: ShipView) => {
			if (view === "pr") shipActions.seedPrTitle();
			setShipView(view);
		},
		onPush: shipActions.push,
		onNoCommitsAhead: () =>
			toast.info(
				t({
					message: "No commits to open a pull request from",
				}),
			),
	};
	const organizationId = useActiveOrganizationId();
	const prActions = usePullRequestActions({
		workspaceId,
		target: currentPr
			? {
					organizationId,
					repoFullName: `${currentPr.repoOwner}/${currentPr.repoName}`,
					prNumber: currentPr.number,
				}
			: null,
		onRefresh: refreshFlowState,
	});

	const pagePolicy = usePagePolicy("4-tier");
	const rightPane = useRightPaneLinkTarget();
	const utils = cloudTrpc.useUtils();
	const seenAt = usePagesMenuSeenAt(workspaceId);
	const markSeen = usePagesMenuSeenStore((state) => state.markSeen);

	const [composing, setComposing] = useState(false);
	const [now, setNow] = useState(() => Date.now());
	const [stopping, setStopping] = useState<ReadonlySet<string>>(new Set());
	const [pendingWork, setPendingWork] = useState<ReadonlySet<string>>(
		new Set(),
	);

	const terminalUtils = workspaceTrpc.useUtils();
	const killTerminal = workspaceTrpc.terminal.killSession.useMutation();
	const subscribeAttachedStores = useCallback(
		(onChange: () => void) => {
			const unsubscribes = [store, ...linkedStores].map((paneStore) =>
				paneStore.subscribe(onChange),
			);
			return () => {
				for (const unsubscribe of unsubscribes) unsubscribe();
			};
		},
		[store, linkedStores],
	);
	const getAttachedSnapshot = useCallback(
		() =>
			getAttachedTerminalIdsKey(
				[store, ...linkedStores].flatMap(
					(paneStore) => paneStore.getState().tabs,
				),
			),
		[store, linkedStores],
	);
	const attachedTerminalIdsKey = useSyncExternalStore(
		subscribeAttachedStores,
		getAttachedSnapshot,
		getAttachedSnapshot,
	);
	const terminalSessionsQuery = workspaceTrpc.terminal.list.useQuery(
		{ workspaceId },
		{
			refetchInterval: getBackgroundTerminalRefetchInterval(open),
			refetchOnWindowFocus: open,
			staleTime: open ? 1_000 : 5_000,
		},
	);
	const settledAttachedTerminalIdsKey = useDebouncedValue(
		attachedTerminalIdsKey,
		BACKGROUND_TERMINAL_ATTACHMENT_DEBOUNCE_MS,
	);
	const detachedTerminals = useMemo(
		() =>
			isLayoutReady
				? getBackgroundTerminalSessions(
						terminalSessionsQuery.data?.sessions ?? [],
						parseAttachedTerminalIdsKey(settledAttachedTerminalIdsKey),
					)
				: [],
		[
			isLayoutReady,
			terminalSessionsQuery.data?.sessions,
			settledAttachedTerminalIdsKey,
		],
	);
	const processes = useMemo(
		() => collectBackgroundWork(detachedTerminals),
		[detachedTerminals],
	);
	const agentWork = useAgentWork(workspaceId);
	const linkedPullRequests = useWorkspacePullRequests(workspaceId, {
		enabled: open,
	});
	const pullRequests: PullRequestEntry[] =
		changes &&
		currentPr &&
		!linkedPullRequests.some(
			(pullRequest) =>
				pullRequest.number === currentPr.number &&
				pullRequest.repoOwner === currentPr.repoOwner &&
				pullRequest.repoName === currentPr.repoName,
		)
			? [
					{
						repoOwner: currentPr.repoOwner,
						repoName: currentPr.repoName,
						number: currentPr.number,
						url: currentPr.url,
						title: currentPr.title,
						state: currentPr.state,
						isDraft: currentPr.isDraft,
						headBranch: currentPr.headRefName,
						checksStatus: currentPrChecks?.overall ?? "none",
					},
					...linkedPullRequests,
				]
			: linkedPullRequests;
	const pullRequestLinkPolicy = usePullRequestLinkPolicy();
	const isCurrentPullRequest = (pullRequest: PullRequestEntry) =>
		changes !== undefined &&
		currentPr !== null &&
		pullRequest.number === currentPr.number &&
		pullRequest.repoOwner === currentPr.repoOwner &&
		pullRequest.repoName === currentPr.repoName;
	const pullRequestRow = (pullRequest: PullRequestEntry) => (
		<PullRequestRow
			key={`${pullRequest.repoOwner}/${pullRequest.repoName}#${pullRequest.number}`}
			pullRequest={pullRequest}
			menu={
				isCurrentPullRequest(pullRequest) && currentPr ? (
					<ShipActionsMenu
						canCreatePr={false}
						{...shipMenuProps}
						pullRequest={{
							canMarkReady: currentPrState === "draft",
							canMerge: currentPr.state === "open" && !currentPr.isDraft,
							isMarkingReady: prActions.isMarkingReady,
							isMerging: prActions.isMerging,
							onMarkReady: prActions.markReady,
							onMerge: prActions.merge,
						}}
					/>
				) : undefined
			}
			onOpen={(target, event) =>
				openPullRequestLink(
					target.url,
					pullRequestLinkPolicy.getAction(event),
					onOpenPullRequest,
				)
			}
		/>
	);
	const paneStores = useMemo(
		() => [store, ...linkedStores],
		[store, linkedStores],
	);
	const agentActions = useAgentWorkActions(paneStores);
	const runningCount =
		processes.length + agentWork.subagents.length + agentWork.shells.length;
	const sourceOf = (terminalId: string) =>
		paneSourceTitle(
			paneStores.map((paneStore) => paneStore.getState()),
			terminalId,
		);

	useEffect(() => {
		if (!open || runningCount === 0) return;
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
		return () => clearInterval(timer);
	}, [open, runningCount]);

	// This menu orders by publish time, not creation time, so it takes one
	// large batch rather than the grid's scroll-sized one. Built once because
	// `invalidate` matches a cached query by its input — a different `limit`
	// here than below and neither a publish nor opening the menu would refresh.
	const workspaceFilter = useMemo(
		() => ({ workspaceId, limit: MENU_PAGE_LIMIT }),
		[workspaceId],
	);
	const workspaceListInput = useMemo(
		() => pagesListInput(workspaceFilter),
		[workspaceFilter],
	);
	const workspacePagesQuery = usePagesList(workspaceFilter, {
		staleTime: 60_000,
	});
	// Only the pins, by id — this menu never needed the rest of the org.
	const pinnedPagesQuery = usePagesList(
		{ ids: favoritePageIds, limit: MENU_PAGE_LIMIT },
		{
			enabled: open && !paneAreaStyle && favoritePageIds.length > 0,
			staleTime: 60_000,
		},
	);

	// A publish from this workspace registers its agent as the page's watcher.
	useWorkspaceEvent(
		"page-watch:changed",
		workspaceId,
		useCallback(() => {
			void utils.page.listPaginated.invalidate(workspaceListInput);
		}, [utils, workspaceListInput]),
	);

	const { workspace, pinned, hasNew } = useMemo(
		() =>
			selectMenuPages({
				workspacePages: workspacePagesQuery.items,
				orgPages: paneAreaStyle ? [] : pinnedPagesQuery.items,
				favoritePageIds: paneAreaStyle ? [] : favoritePageIds,
				seenAt,
			}),
		[
			workspacePagesQuery.items,
			pinnedPagesQuery.items,
			favoritePageIds,
			paneAreaStyle,
			seenAt,
		],
	);

	const newestPublishedAt = workspace[0]?.publishedAtMs ?? 0;
	useEffect(() => {
		if (open) markSeen(workspaceId, newestPublishedAt);
	}, [open, workspaceId, newestPublishedAt, markSeen]);

	useEffect(() => {
		if (fits) setPopoverOpen(false);
	}, [fits]);

	const setFloating = (next: boolean) => {
		setPopoverOpen(next);
		if (next) {
			void utils.page.listPaginated.invalidate(workspaceListInput);
			return;
		}
		setComposing(false);
		setShipView(null);
	};

	const onTriggerClick = () => {
		if (fits) {
			setHidden(workspaceId, !hidden);
			return;
		}
		setFloating(!popoverOpen);
	};

	const handleOpenPage = (page: MenuPage, event: MouseEvent) => {
		const action = pagePolicy.getAction(event) ?? "pane";
		if (action === "external") {
			const url = new URL(
				`/page/${encodeURIComponent(page.slug)}`,
				env.NEXT_PUBLIC_WEB_URL,
			).toString();
			electronTrpcClient.external.openUrl.mutate(url).catch((error) => {
				console.error(
					"[WorkspaceActivityMenu] Failed to open page:",
					url,
					error,
				);
			});
			return;
		}
		const pageData = { pageId: page.id, slug: page.slug, title: page.title };
		if (rightPane) {
			rightPane.reveal();
			openPagePaneInStore(rightPane.store, pageData, "tab");
			return;
		}
		onOpenPage(pageData, action === "newTab" ? "tab" : "split");
	};

	const handleOpenWork = (work: BackgroundWork) => {
		clearTerminalBackgroundMarker(workspaceId, work.terminalId);
		focusOrAddTerminalPane(store, work.terminalId);
		void terminalUtils.terminal.list.invalidate({ workspaceId });
	};

	const handleStopWork = (work: BackgroundWork) => {
		setStopping((current) => new Set(current).add(work.key));
		const release = () =>
			setStopping((current) => {
				const next = new Set(current);
				next.delete(work.key);
				return next;
			});
		void killTerminal
			.mutateAsync({ terminalId: work.terminalId, workspaceId })
			.then(() => {
				clearTerminalBackgroundMarker(workspaceId, work.terminalId);
				void terminalUtils.terminal.list.invalidate({ workspaceId });
			})
			.catch((error: unknown) => {
				console.warn("[WorkspaceActivityMenu] could not stop task", error);
				toast.error(t({ message: "Couldn't stop the background task" }));
			})
			.finally(release);
	};

	const workRows = (items: BackgroundWork[]) =>
		items.map((work) => (
			<BackgroundWorkRow
				key={work.key}
				work={work}
				now={now}
				stopping={stopping.has(work.key)}
				onOpen={handleOpenWork}
				onStop={handleStopWork}
			/>
		));

	const runPending = (
		work: AgentWork,
		run: (work: AgentWork) => Promise<void>,
	) => {
		setPendingWork((current) => new Set(current).add(work.key));
		void run(work).finally(() =>
			setPendingWork((current) => {
				const next = new Set(current);
				next.delete(work.key);
				return next;
			}),
		);
	};

	const agentRows = (items: AgentWork[]) =>
		items.map((work) => (
			<AgentWorkRow
				key={work.key}
				work={work}
				source={sourceOf(work.terminalId)}
				now={now}
				onOpen={(target) =>
					agentActions.open(target, { subagent: target.kind === "subagent" })
				}
				pending={pendingWork.has(work.key)}
				onStop={(target) => runPending(target, agentActions.stop)}
				onMoveToBackground={(target) =>
					runPending(target, agentActions.moveToBackground)
				}
			/>
		));

	const emptyRow = (message: ReactNode) => (
		<div className="px-2 py-1.5 text-xs text-muted-foreground/70">
			{message}
		</div>
	);

	const renderPanel = (variant: "docked" | "floating") => (
		// biome-ignore lint/a11y/noStaticElementInteractions: arrow keys move between the panel's buttons
		<div
			className="pointer-events-auto flex flex-col overflow-y-auto rounded-xl border border-border/60 bg-popover p-1 text-popover-foreground shadow-sm"
			style={{
				maxHeight:
					variant === "floating"
						? `min(${PANEL_MAX_HEIGHT_PX}px, var(--radix-popover-content-available-height))`
						: `min(${PANEL_MAX_HEIGHT_PX}px, 100%)`,
			}}
			id={(variant === "docked") === docked ? panelId : undefined}
			data-activity-panel
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					if (!shipView && !composing) return;
					event.preventDefault();
					event.stopPropagation();
					if (shipView) setShipView(null);
					else setComposing(false);
					return;
				}
				if (composing || shipView) return;
				if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
				const items = [
					...event.currentTarget.querySelectorAll<HTMLElement>(
						"button:not([disabled])",
					),
				];
				if (items.length === 0) return;
				event.preventDefault();
				const index = items.indexOf(document.activeElement as HTMLElement);
				const step = event.key === "ArrowDown" ? 1 : -1;
				items[(index + step + items.length) % items.length]?.focus();
			}}
		>
			<AnimatedHeight>
				{composing ? (
					<div key="composing" className={VIEW_ENTER_CLASSNAME}>
						<button
							type="button"
							onClick={() => setComposing(false)}
							className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent"
						>
							<ArrowLeft className="size-3.5 shrink-0" />
							<Trans>New page</Trans>
						</button>
						<NewPageComposer
							workspaceId={workspaceId}
							onSent={() => setComposing(false)}
							onCreateNewAgentSession={onCreateNewAgentSession}
							onFocusAgentTerminal={onFocusAgentTerminal}
						/>
					</div>
				) : shipView ? (
					<div key="ship" className={VIEW_ENTER_CLASSNAME}>
						<button
							type="button"
							onClick={() => setShipView(null)}
							className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent"
						>
							<ArrowLeft className="size-3.5 shrink-0" />
							{shipView === "commit" ? (
								<Trans>Commit</Trans>
							) : (
								<Trans>Create PR</Trans>
							)}
						</button>
						<div className="p-1">
							{shipView === "commit" ? (
								<CommitForm actions={shipActions} />
							) : (
								<CreatePrForm actions={shipActions} />
							)}
						</div>
					</div>
				) : (
					<div
						key="list"
						className={cn("divide-y divide-border", VIEW_ENTER_CLASSNAME)}
					>
						{changes && !currentPr && (
							<section className="py-1">
								<ActivityMenuHeader
									title={currentWorkspace.name}
									canCreatePr={shipMenu.canCreatePr}
									{...shipMenuProps}
								/>
								<ChangesMenuRow
									stats={changesStats}
									isOpen={changes.isOpen}
									onToggle={changes.onToggle}
								/>
							</section>
						)}
						{pullRequests.length > 0 && (
							<MenuGroup
								title={<Trans>Pull requests</Trans>}
								count={pullRequests.length}
							>
								<div>{pullRequests.map(pullRequestRow)}</div>
							</MenuGroup>
						)}
						{agentWork.subagents.length + agentWork.finished.length > 0 && (
							<MenuGroup
								title={<Trans>Subagents</Trans>}
								count={agentWork.subagents.length}
							>
								<div>
									{agentRows(agentWork.subagents)}
									{agentWork.finished.map((entry) => (
										<FinishedSubagentRow
											key={entry.key}
											entry={entry}
											source={sourceOf(entry.terminalId)}
											onOpen={(target) =>
												agentActions.open(target, { subagent: true })
											}
										/>
									))}
								</div>
							</MenuGroup>
						)}
						{processes.length + agentWork.shells.length > 0 && (
							<MenuGroup
								title={<Trans>Background processes</Trans>}
								count={processes.length + agentWork.shells.length}
							>
								<div>
									{agentRows(agentWork.shells)}
									{workRows(processes)}
								</div>
							</MenuGroup>
						)}
						<MenuGroup
							title={<Trans>Pages</Trans>}
							addLabel={t({ message: "New page" })}
							onAdd={() => setComposing(true)}
						>
							<div>
								{workspace.length > 0
									? workspace.map((page) => (
											<PagesMenuRow
												key={page.id}
												page={page}
												onOpen={handleOpenPage}
											/>
										))
									: emptyRow(<Trans>No pages yet</Trans>)}
							</div>
						</MenuGroup>
						{pinned.length > 0 && (
							<MenuGroup title={<Trans>Pinned</Trans>}>
								<div>
									{pinned.map((page) => (
										<PagesMenuRow
											key={page.id}
											page={page}
											onOpen={handleOpenPage}
										/>
									))}
								</div>
							</MenuGroup>
						)}
					</div>
				)}
			</AnimatedHeight>
		</div>
	);

	return (
		<Popover open={floating} onOpenChange={setFloating}>
			<PopoverAnchor
				virtualRef={{ current: anchorNode ?? triggerRef.current }}
			/>
			<Tooltip disableHoverableContent>
				<TooltipTrigger asChild>
					<button
						ref={triggerRef}
						type="button"
						onClick={onTriggerClick}
						aria-label={
							changes && currentPr
								? t({
										message: `Workspace activity, pull request #${currentPr.number}`,
									})
								: t({ message: "Workspace activity" })
						}
						aria-expanded={open}
						aria-controls={open ? panelId : undefined}
						aria-describedby={hasNew ? newPageStatusId : undefined}
						className={cn(
							"no-drag relative flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors",
							"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
							floating
								? "border-foreground/30 bg-foreground/15 text-foreground hover:bg-foreground/20"
								: "border-border/60 bg-muted/30 text-muted-foreground/80 hover:bg-muted/60 hover:text-foreground",
						)}
					>
						<ListTree className="size-3.5 shrink-0" />
						{runningCount > 0 ? (
							<>
								<span className="size-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500" />
								<span className="tabular-nums">{runningCount}</span>
							</>
						) : (
							!paneAreaStyle &&
							workspace.length > 0 && (
								<span className="tabular-nums">{workspace.length}</span>
							)
						)}
						{changes && currentPr && currentPrState ? (
							<>
								<span className="h-3.5 w-px shrink-0 bg-border" />
								<PRIcon state={currentPrState} className="size-3.5 shrink-0" />
								<span className="tabular-nums">#{currentPr.number}</span>
								{currentPrChecks && showsChecks(currentPrState) && (
									<PRStatusIndicators checks={currentPrChecks} />
								)}
							</>
						) : (
							triggerChangesStats && (
								<>
									<span className="h-3.5 w-px shrink-0 bg-border" />
									<GitCompareArrows className="size-3.5 shrink-0" />
									<span className="flex items-center gap-1">
										<ChangesStats stats={triggerChangesStats} />
									</span>
								</>
							)
						)}
						{hasNew && (
							<>
								<span
									aria-hidden="true"
									className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-blue-500"
								/>
								<span id={newPageStatusId} className="sr-only">
									<Trans context="badge on a page published since the menu was last opened">
										New
									</Trans>
								</span>
							</>
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					{open ? (
						<Trans>Hide workspace activity</Trans>
					) : (
						<Trans>Show workspace activity</Trans>
					)}
				</TooltipContent>
			</Tooltip>
			<PopoverContent
				align="end"
				sideOffset={0}
				className="w-80 border-0 bg-transparent p-0 shadow-none duration-[240ms] ease-[cubic-bezier(0.23,1,0.32,1)] data-[state=closed]:duration-150 data-[state=closed]:ease-[cubic-bezier(0.4,0,1,1)] data-[side=bottom]:slide-in-from-top-1 motion-reduce:animate-none"
				onEscapeKeyDown={(event) => {
					if (shipView || composing) event.preventDefault();
				}}
				onInteractOutside={(event) => {
					if (triggerRef.current?.contains(event.target as Node))
						event.preventDefault();
				}}
			>
				{renderPanel("floating")}
			</PopoverContent>
			{asideNode &&
				dockedMounted &&
				createPortal(renderPanel("docked"), asideNode)}
		</Popover>
	);
}
