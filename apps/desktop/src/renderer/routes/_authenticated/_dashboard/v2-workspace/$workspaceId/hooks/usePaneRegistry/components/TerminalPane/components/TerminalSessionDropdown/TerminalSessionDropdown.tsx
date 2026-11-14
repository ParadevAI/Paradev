import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { formatCompactRelativeTime } from "@superset/i18n/format";
import { type RendererContext, usePaneAppearance } from "@superset/panes";
import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import {
	Bot,
	Check,
	ChevronDown,
	LoaderCircle,
	Pencil,
	Plus,
	Trash2,
} from "lucide-react";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { useRenderStressInstrumentation } from "renderer/lib/performance/stress-instrumentation";
import { markTerminalForBackground } from "renderer/lib/terminal/terminal-background-intents";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { RenameDialog } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/RenameDialog";
import type { CreateNewAgentSession } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useAgentSessionLauncher";
import type { TerminalLauncher } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2TerminalLauncher";
import type {
	PaneViewerData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { SurfaceForkSource } from "../../../../hooks/useSurfaceFork";
import { useSurfaceForkSource } from "../../../../hooks/useSurfaceForkSource";
import { AccountUsageMenuSection } from "../../../AccountUsageMenuSection";
import { ForkMenuItems } from "../../../ForkMenuItems";
import { StopHeaderEvents } from "../../../StopHeaderEvents";
import { UsageWarningDot } from "../../../UsageWarningDot";
import { TerminalPaneIcon } from "../TerminalPaneIcon";
import { ContinueWithAgentDialog } from "./components/ContinueWithAgentDialog";
import { useTerminalAgentConfig } from "./hooks/useTerminalAgentConfig";
import {
	getTerminalDisplayTitle,
	getTerminalSessionListRefetchInterval,
	getTerminalSessionListStaleTime,
	shouldQueryTerminalSessionList,
	TERMINAL_TITLE_SETTLE_MS,
} from "./TerminalSessionDropdown.utils";

interface TerminalSessionDropdownProps {
	context: RendererContext<PaneViewerData>;
	launcher: TerminalLauncher;
	workspaceId: string;
	onSessionRemoved: (terminalId: string) => void;
	onCreateNewAgentSession: CreateNewAgentSession;
	onForkIntoOtherSurface: (source: SurfaceForkSource) => void;
}

interface VisibleTerminalSession {
	terminalId: string;
	createdAt?: number;
	exited: boolean;
	exitCode: number;
	attached: boolean;
	title: string | null;
	customTitle: string | null;
	pending?: boolean;
}

interface RenameTarget {
	terminalId: string;
	/** The session's name today, or "" when it has never been named. */
	name: string;
}

interface TerminalPaneLocation {
	tabId: string;
	paneId: string;
	titleOverride?: string;
}

const EMPTY_TERMINAL_PANE_LOCATIONS = new Map<string, TerminalPaneLocation[]>();

function formatCreatedAt(createdAt: number | undefined): string {
	if (!createdAt)
		return i18n._(
			msg({
				message: "Creating",
			}),
		);

	return formatCompactRelativeTime(createdAt);
}

function getTerminalPaneLocations(
	context: RendererContext<PaneViewerData>,
): Map<string, TerminalPaneLocation[]> {
	const locations = new Map<string, TerminalPaneLocation[]>();
	for (const tab of context.store.getState().tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.id === context.pane.id || pane.kind !== "terminal") continue;
			const data = pane.data as Partial<TerminalPaneData>;
			if (data.terminalId) {
				const terminalLocations = locations.get(data.terminalId) ?? [];
				terminalLocations.push({
					tabId: tab.id,
					paneId: pane.id,
					titleOverride: pane.titleOverride,
				});
				locations.set(data.terminalId, terminalLocations);
			}
		}
	}
	return locations;
}

export function TerminalSessionDropdown({
	context,
	launcher,
	workspaceId,
	onSessionRemoved,
	onCreateNewAgentSession,
	onForkIntoOtherSurface,
}: TerminalSessionDropdownProps) {
	const { t } = useLingui();
	const isCards = usePaneAppearance() === "cards";
	const [isOpen, setIsOpen] = useState(false);
	const collections = useCollections();
	const { terminalId } = context.pane.data as TerminalPaneData;
	const terminalInstanceId = context.pane.id;
	const utils = workspaceTrpc.useUtils();
	const killTerminalSession = workspaceTrpc.terminal.killSession.useMutation();
	const renameTerminalSession = workspaceTrpc.terminal.rename.useMutation();
	const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
	const [continuing, setContinuing] = useState(false);
	const { binding, sourceConfig, canFork } = useTerminalAgentConfig(
		workspaceId,
		terminalId,
	);
	const surfaceFork = useSurfaceForkSource(workspaceId, {
		kind: "terminal",
		data: { terminalId },
	});
	const sessionsInput = useMemo(() => ({ workspaceId }), [workspaceId]);
	const sessionsQuery = workspaceTrpc.terminal.list.useQuery(sessionsInput, {
		enabled: shouldQueryTerminalSessionList(isOpen, Boolean(binding)),
		notifyOnChangeProps: isOpen ? ["data", "isFetching"] : ["data"],
		refetchInterval: getTerminalSessionListRefetchInterval(isOpen),
		refetchOnWindowFocus: false,
		staleTime: getTerminalSessionListStaleTime(isOpen),
	});
	useRenderStressInstrumentation("TerminalSessionDropdown", {
		warnAt: 30,
		getDetails: () => ({
			workspaceId,
			terminalId,
			isOpen,
			hasSessionData: Boolean(sessionsQuery.data),
		}),
	});
	const { data: localWorkspaceRows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ v2WorkspaceLocalState: collections.v2WorkspaceLocalState })
				.where(({ v2WorkspaceLocalState }) =>
					eq(v2WorkspaceLocalState.workspaceId, workspaceId),
				),
		[collections, workspaceId],
	);
	const workspaceRunTerminals =
		localWorkspaceRows[0]?.workspaceRunTerminals ?? {};
	const workspaceRunState = workspaceRunTerminals[terminalId]?.state ?? null;

	const sessions = useMemo<VisibleTerminalSession[]>(() => {
		const liveSessions = sessionsQuery.data?.sessions ?? [];
		const ordered = [...liveSessions].sort((a, b) => {
			if (a.terminalId === terminalId) return -1;
			if (b.terminalId === terminalId) return 1;
			return (b.createdAt ?? 0) - (a.createdAt ?? 0);
		});
		if (ordered.some((session) => session.terminalId === terminalId)) {
			return ordered;
		}
		return [
			{
				terminalId,
				exited: false,
				exitCode: 0,
				attached: false,
				title: null,
				customTitle: null,
				pending: true,
			},
			...ordered,
		];
	}, [sessionsQuery.data?.sessions, terminalId]);
	const currentSession = sessions.find(
		(session) => session.terminalId === terminalId,
	);
	const subscribeTitle = useCallback(
		(callback: () => void) =>
			terminalRuntimeRegistry.onTitleChange(
				terminalId,
				callback,
				terminalInstanceId,
			),
		[terminalId, terminalInstanceId],
	);
	const getTitleSnapshot = useCallback(
		() => terminalRuntimeRegistry.getTitle(terminalId, terminalInstanceId),
		[terminalId, terminalInstanceId],
	);
	const runtimeTitle = useSyncExternalStore(subscribeTitle, getTitleSnapshot);
	const renderTerminalPaneLocations = isOpen
		? getTerminalPaneLocations(context)
		: EMPTY_TERMINAL_PANE_LOCATIONS;

	const handleSelectSession = (session: VisibleTerminalSession) => {
		const nextTerminalId = session.terminalId;
		if (nextTerminalId === terminalId) {
			setIsOpen(false);
			return;
		}

		const state = context.store.getState();
		const terminalPaneLocations = getTerminalPaneLocations(context);
		const existingLocation = terminalPaneLocations.get(nextTerminalId)?.[0];
		if (existingLocation) {
			state.setActiveTab(existingLocation.tabId);
			state.setActivePane({
				tabId: existingLocation.tabId,
				paneId: existingLocation.paneId,
			});
			setIsOpen(false);
			return;
		}

		if ((terminalPaneLocations.get(terminalId)?.length ?? 0) === 0) {
			markTerminalForBackground(terminalId, workspaceId);
		}

		state.setPaneData({
			paneId: context.pane.id,
			data: {
				terminalId: nextTerminalId,
			} as PaneViewerData,
		});
		state.setPaneTitleOverride({
			tabId: context.tab.id,
			paneId: context.pane.id,
			titleOverride: undefined,
		});
		setIsOpen(false);
	};

	const closePanesForTerminal = (targetTerminalId: string) => {
		const terminalPaneLocations = getTerminalPaneLocations(context);
		for (const location of terminalPaneLocations.get(targetTerminalId) ?? []) {
			context.store.getState().closePane({
				tabId: location.tabId,
				paneId: location.paneId,
				intent: "remove",
			});
		}

		if (targetTerminalId === terminalId) {
			void context.actions.close();
		}
	};

	const removeTerminalSession = async (session: VisibleTerminalSession) => {
		try {
			await killTerminalSession.mutateAsync({
				terminalId: session.terminalId,
				workspaceId,
			});
			try {
				onSessionRemoved(session.terminalId);
			} finally {
				closePanesForTerminal(session.terminalId);
			}
		} finally {
			await utils.terminal.list.invalidate({ workspaceId });
		}
	};

	const handleRemoveTerminal = (session: VisibleTerminalSession) => {
		toast.promise(removeTerminalSession(session), {
			loading: t({
				message: "Removing terminal...",
			}),
			success: t({
				message: "Terminal removed",
			}),
			error: t({
				message: "Failed to remove terminal",
			}),
		});
	};

	const renameSession = async (target: RenameTarget, name: string) => {
		await renameTerminalSession.mutateAsync({
			terminalId: target.terminalId,
			workspaceId,
			title: name,
		});
		// A pane label from a preset or a launch would sit on top of the name
		// the user just chose, so the name they chose retires it.
		if (name.trim()) {
			const state = context.store.getState();
			const clearLabel = (location: { tabId: string; paneId: string }) =>
				state.setPaneTitleOverride({ ...location, titleOverride: undefined });
			for (const location of getTerminalPaneLocations(context).get(
				target.terminalId,
			) ?? []) {
				clearLabel(location);
			}
			// getTerminalPaneLocations answers "where else is this terminal",
			// so this pane — the usual one being renamed — is not in it.
			if (target.terminalId === terminalId) {
				clearLabel({ tabId: context.tab.id, paneId: context.pane.id });
			}
		}
		await utils.terminal.list.invalidate({ workspaceId });
	};

	const handleRenameSession = (target: RenameTarget, name: string) => {
		const trimmed = name.trim();
		toast.promise(renameSession(target, name), {
			loading: trimmed
				? t({
						message: `Renaming session to ${trimmed}...`,
					})
				: t({
						message: "Clearing session name...",
					}),
			success: trimmed
				? t({
						message: `Session renamed to ${trimmed}`,
					})
				: t({
						message: "Session name cleared",
					}),
			error: t({
				message: "Failed to rename session",
			}),
		});
	};

	const handleNewTerminal = () => {
		const state = context.store.getState();
		const terminalPaneLocations = getTerminalPaneLocations(context);
		if ((terminalPaneLocations.get(terminalId)?.length ?? 0) === 0) {
			markTerminalForBackground(terminalId, workspaceId);
		}
		state.setPaneData({
			paneId: context.pane.id,
			data: {
				terminalId: launcher.mint(),
				createOnAttach: true,
			} as PaneViewerData,
		});
		state.setPaneTitleOverride({
			tabId: context.tab.id,
			paneId: context.pane.id,
			titleOverride: undefined,
		});
		void utils.terminal.list.invalidate({ workspaceId });
		setIsOpen(false);
	};

	const hostTitle =
		runtimeTitle !== undefined ? runtimeTitle : currentSession?.title;
	const titleOverride = context.pane.titleOverride;
	// A first name given on another client arrives only as a new live title,
	// so an unnamed agent session re-reads the list once that title settles.
	const watchesForName = Boolean(binding) && !currentSession?.customTitle;
	const seenHostTitle = useRef(hostTitle);
	useEffect(() => {
		if (hostTitle === seenHostTitle.current) return;
		seenHostTitle.current = hostTitle;
		if (!watchesForName || isOpen) return;
		const timer = setTimeout(
			() => void utils.terminal.list.invalidate({ workspaceId }),
			TERMINAL_TITLE_SETTLE_MS,
		);
		return () => clearTimeout(timer);
	}, [hostTitle, watchesForName, isOpen, utils, workspaceId]);
	const triggerTitle = getTerminalDisplayTitle({
		titleOverride,
		customTitle: currentSession?.customTitle,
		agentLabel: binding ? AGENT_IDENTITY_LABELS[binding.agentId] : undefined,
		runtimeTitle: hostTitle,
	});

	const forkIntoCli = () => {
		if (!sourceConfig || !binding?.agentSessionId) return;
		void onCreateNewAgentSession({
			configId: sourceConfig.id,
			placement: "new-tab",
			prompt: "",
			forkSessionId: binding.agentSessionId,
		});
	};

	return (
		<>
			<StopHeaderEvents>
				{renameTarget && (
					<RenameDialog
						key={renameTarget.terminalId}
						name={renameTarget.name}
						title={t({ message: "Rename session" })}
						description={t({
							message:
								"Leave it empty to go back to the name the terminal reports.",
						})}
						inputLabel={t({ message: "Session name" })}
						onClose={() => setRenameTarget(null)}
						onSubmit={(name) => handleRenameSession(renameTarget, name)}
					/>
				)}
				{continuing && (
					<ContinueWithAgentDialog
						workspaceId={workspaceId}
						terminalId={terminalId}
						onClose={() => setContinuing(false)}
						onCreateNewAgentSession={onCreateNewAgentSession}
					/>
				)}
			</StopHeaderEvents>
			<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						title={
							hostTitle && hostTitle !== triggerTitle
								? `${triggerTitle} · ${hostTitle}`
								: triggerTitle
						}
						className={cn(
							"flex min-w-0 max-w-96 items-center gap-1.5 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
							isCards && "-ml-1.5",
						)}
						onClick={(event) => event.stopPropagation()}
					>
						<TerminalPaneIcon
							workspaceId={workspaceId}
							terminalId={terminalId}
						/>
						{workspaceRunState && (
							<span
								className={
									workspaceRunState === "running"
										? "size-1.5 shrink-0 rounded-full bg-emerald-500"
										: workspaceRunState === "stopped-by-user"
											? "size-1.5 shrink-0 rounded-full bg-amber-500"
											: "size-1.5 shrink-0 rounded-full bg-red-500"
								}
								title={t({
									message: `Workspace run: ${workspaceRunState}`,
								})}
							/>
						)}
						<span className="min-w-0 flex-1 truncate text-left">
							{triggerTitle}
						</span>
						<ChevronDown className="size-3 shrink-0 opacity-60" />
						<UsageWarningDot
							workspaceId={workspaceId}
							terminalId={terminalId}
						/>
					</button>
				</DropdownMenuTrigger>
				<StopHeaderEvents>
					<DropdownMenuContent align="start" className="w-96">
						<DropdownMenuItem onSelect={handleNewTerminal}>
							<Plus />
							<Trans>New terminal</Trans>
						</DropdownMenuItem>
						{!currentSession?.pending && (
							<DropdownMenuItem
								onSelect={() =>
									setRenameTarget({
										terminalId,
										name: currentSession?.customTitle ?? "",
									})
								}
							>
								<Pencil />
								<Trans>Rename session</Trans>
							</DropdownMenuItem>
						)}
						<DropdownMenuSeparator />
						<DropdownMenuLabel className="flex items-center gap-2 font-normal text-muted-foreground text-xs">
							<Trans>Terminal sessions</Trans>
							{sessionsQuery.isFetching && (
								<LoaderCircle className="size-3 shrink-0 animate-spin" />
							)}
						</DropdownMenuLabel>
						<div className="max-h-80 overflow-y-auto">
							{sessions.length > 0 ? (
								sessions.map((session) => {
									const isCurrent = session.terminalId === terminalId;
									const location = renderTerminalPaneLocations.get(
										session.terminalId,
									)?.[0];
									const createdAtLabel = formatCreatedAt(session.createdAt);
									const status = isCurrent
										? t({
												message: "Current",
											})
										: workspaceRunTerminals[session.terminalId]
											? t({
													message: "Run",
												})
											: session.pending
												? t({
														message: "Starting",
													})
												: session.attached
													? t({
															message: "Attached",
														})
													: t({
															message: "Detached",
														});
									const title = isCurrent
										? triggerTitle
										: getTerminalDisplayTitle({
												titleOverride: location?.titleOverride,
												sessionTitle: session.title,
											});

									return (
										<DropdownMenuItem
											key={session.terminalId}
											className="group flex items-center gap-2"
											onSelect={(_event) => {
												handleSelectSession(session);
											}}
										>
											<span className="w-4 shrink-0">
												{isCurrent && <Check className="size-3.5" />}
											</span>
											<span className="min-w-0 flex-1 truncate text-xs">
												{title}
											</span>
											<span className="shrink-0 text-xs text-muted-foreground/70">
												{createdAtLabel}
											</span>
											<span className="shrink-0 text-xs text-muted-foreground">
												{status}
											</span>
											{/* Nothing to rename until the session exists on the
										    host: a pending row is a terminal id this pane has
										    minted and not yet attached. */}
											<button
												type="button"
												hidden={session.pending}
												aria-label={t({
													message: `Rename ${title}`,
												})}
												className="shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
												onClick={(event) => {
													event.preventDefault();
													event.stopPropagation();
													setIsOpen(false);
													setRenameTarget({
														terminalId: session.terminalId,
														name: session.customTitle ?? "",
													});
												}}
											>
												<Pencil className="size-3" />
											</button>
											<button
												type="button"
												aria-label={
													session.createdAt
														? t({
																message: `Remove terminal ${createdAtLabel}`,
															})
														: t({
																message: "Remove terminal session",
															})
												}
												disabled={killTerminalSession.isPending}
												className="shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30 group-hover:opacity-100"
												onClick={(event) => {
													event.preventDefault();
													event.stopPropagation();
													handleRemoveTerminal(session);
												}}
											>
												<Trash2 className="size-3" />
											</button>
										</DropdownMenuItem>
									);
								})
							) : (
								<div className="px-2 py-1.5 text-xs text-muted-foreground">
									<Trans>No live sessions</Trans>
								</div>
							)}
						</div>
						<AccountUsageMenuSection
							workspaceId={workspaceId}
							terminalId={terminalId}
						/>
						{binding && (
							<>
								<DropdownMenuSeparator />
								<ForkMenuItems
									onForkIntoCli={canFork ? forkIntoCli : undefined}
									onForkIntoChat={
										surfaceFork
											? () => onForkIntoOtherSurface(surfaceFork)
											: undefined
									}
								/>
								<DropdownMenuItem onSelect={() => setContinuing(true)}>
									<Bot />
									<Trans>Continue with another agent…</Trans>
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuContent>
				</StopHeaderEvents>
			</DropdownMenu>
		</>
	);
}
