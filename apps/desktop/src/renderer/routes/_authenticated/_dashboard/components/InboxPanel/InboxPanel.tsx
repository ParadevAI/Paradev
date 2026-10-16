import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Spinner } from "@superset/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	LuArchive,
	LuCheck,
	LuClock,
	LuInbox,
	LuListFilter,
	LuX,
} from "react-icons/lu";
import { resolveProjectIconUrl } from "renderer/hooks/host-projects/resolveProjectIconUrl";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { useNow } from "renderer/hooks/useNow";
import { useHotkey } from "renderer/hotkeys";
import { useHotkeyScopeStore } from "renderer/hotkeys/stores/hotkeyScopeStore";
import { isTextEntryTarget } from "renderer/hotkeys/utils/scope";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ToolbarMenuButton } from "renderer/routes/_authenticated/_dashboard/components/ToolbarMenuButton";
import { useCloudWorkspaceRepositories } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudWorkspaceRepositories";
import { useDismissFinishedWorkspace } from "renderer/routes/_authenticated/_dashboard/hooks/useDismissFinishedWorkspace";
import { useFinishedWorkspaces } from "renderer/routes/_authenticated/_dashboard/hooks/useFinishedWorkspaces";
import { useInboxEnabled } from "renderer/routes/_authenticated/_dashboard/hooks/useInboxEnabled";
import {
	useInboxRouteSelection,
	useInboxSelection,
} from "renderer/routes/_authenticated/_dashboard/hooks/useInboxSelection";
import { useInboxSelectionStore } from "renderer/routes/_authenticated/_dashboard/stores/inboxSelectionStore";
import { finishedItemId } from "renderer/routes/_authenticated/_dashboard/utils/inboxSelection";
import {
	formatPeriod,
	periodKey,
	periodOf,
} from "renderer/routes/_authenticated/_dashboard/utils/timePeriod";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel";
import {
	INBOX_PANEL_DEFAULT_WIDTH,
	INBOX_PANEL_MAX_WIDTH,
	INBOX_PANEL_MIN_WIDTH,
	type InboxView,
	useInboxPanelStore,
} from "renderer/stores/inbox-panel-state";
import { FinishedWorkspaceRow } from "./components/FinishedWorkspaceRow";
import { MarkReadIcon } from "./components/InboxCard/components/MarkReadIcon";
import { InboxPanelCard } from "./components/InboxPanelCard";
import { InboxPrefetch } from "./components/InboxPrefetch";
import { useInboxFocusScope } from "./hooks/useInboxFocusScope";
import { inboxSourceTarget } from "./utils/inboxSourceTarget";
import { type InboxItem, mergeInboxItems } from "./utils/mergeInboxItems";

const INBOX_FALLBACK_REFETCH_INTERVAL_MS = 30_000;
const NOW_TICK_MS = 30_000;

/** The status radio: a view, plus whether read cards are hidden. */
type InboxStatus = "all" | "unread" | "archive" | "scheduled";

const STATUS_VIEW: Record<InboxStatus, InboxView> = {
	all: "open",
	unread: "open",
	archive: "archive",
	scheduled: "scheduled",
};

const UnreadGlyph = ({ className }: { className?: string }) => (
	<MarkReadIcon unread={false} className={className} />
);

const STATUSES: { value: InboxStatus; icon: typeof LuInbox }[] = [
	{ value: "all", icon: LuInbox },
	{ value: "unread", icon: UnreadGlyph },
	{ value: "archive", icon: LuArchive },
	{ value: "scheduled", icon: LuClock },
];

export function InboxPanel() {
	const { t } = useLingui();
	const navigate = useNavigate();
	const isEnabled = useInboxEnabled();
	const isOpen = useInboxPanelStore((s) => s.isOpen);
	const setOpen = useInboxPanelStore((s) => s.setOpen);
	const view = useInboxPanelStore((s) => s.view);
	const setView = useInboxPanelStore((s) => s.setView);
	const showUpdates = useInboxPanelStore((s) => s.showUpdates);
	const setShowUpdates = useInboxPanelStore((s) => s.setShowUpdates);
	const showFinished = useInboxPanelStore((s) => s.showFinished);
	const setShowFinished = useInboxPanelStore((s) => s.setShowFinished);
	const width = useInboxPanelStore((s) => s.width);
	const setWidth = useInboxPanelStore((s) => s.setWidth);
	const [isResizing, setIsResizing] = useState(false);
	const panelRef = useRef<HTMLElement>(null);
	const { select, move, advanceFrom } = useInboxSelection();
	useInboxRouteSelection();
	const showsCard = useInboxSelectionStore((s) => s.selectedId !== null);
	useInboxFocusScope(panelRef, isEnabled && isOpen, showsCard);
	const dismissFinished = useDismissFinishedWorkspace();
	const openUrl = electronTrpc.external.openUrl.useMutation();
	// Mounted a frame before it widens, and until the width has shrunk back to
	// zero, so the panel slides the content aside instead of popping.
	const [present, setPresent] = useState(isOpen);
	const [expanded, setExpanded] = useState(isOpen);
	useEffect(() => {
		if (!isOpen) {
			setExpanded(false);
			return;
		}
		setPresent(true);
		const frame = requestAnimationFrame(() => setExpanded(true));
		return () => cancelAnimationFrame(frame);
	}, [isOpen]);
	const { workspaces } = useHostWorkspaces();
	const { projects } = useHostProjects();
	const { workspaces: cloudWorkspaces, organizationId } = useCloudWorkspaces();
	const { primaryRepositoryById } = useCloudWorkspaceRepositories({
		organizationId,
		enabled: isEnabled && isOpen,
	});
	const now = useNow(NOW_TICK_MS);
	const [unreadOnly, setUnreadOnly] = useState(false);
	const status: InboxStatus =
		view === "open" ? (unreadOnly ? "unread" : "all") : view;
	const setStatus = (next: InboxStatus) => {
		setUnreadOnly(next === "unread");
		setView(STATUS_VIEW[next]);
	};

	const finishedHere = useFinishedWorkspaces();
	const finished = view === "open" && showFinished ? finishedHere : [];
	const tiers = [
		"ask" as const,
		...(showUpdates ? ["update" as const] : []),
		...(showFinished ? ["finished" as const] : []),
	];
	const cards = cloudTrpc.inbox.list.useInfiniteQuery(
		{ view, ...(view === "open" ? { tiers } : {}) },
		{
			enabled: isEnabled && isOpen,
			staleTime: 15_000,
			refetchInterval: INBOX_FALLBACK_REFETCH_INTERVAL_MS,
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		},
	);
	const listRef = useRef<HTMLDivElement>(null);
	const sentinelRef = useRef<HTMLDivElement>(null);
	const { hasNextPage, isFetchingNextPage, fetchNextPage } = cards;
	useEffect(() => {
		const sentinel = sentinelRef.current;
		const root = listRef.current;
		if (!sentinel || !root || !hasNextPage || isFetchingNextPage) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) void fetchNextPage();
			},
			{ root, rootMargin: "200px" },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);
	const counts = cloudTrpc.inbox.count.useQuery(undefined, {
		enabled: isEnabled && isOpen,
		staleTime: 15_000,
		refetchInterval: INBOX_FALLBACK_REFETCH_INTERVAL_MS,
	});
	const utils = cloudTrpc.useUtils();
	const invalidate = () => {
		void utils.inbox.list.invalidate();
		void utils.inbox.count.invalidate();
	};
	const onError = (error: unknown) => toast.error(errorMessage(error));
	const resolve = cloudTrpc.inbox.resolve.useMutation({
		onSuccess: invalidate,
		onError,
	});
	const markRead = cloudTrpc.inbox.markRead.useMutation({
		onSuccess: invalidate,
		onError,
	});

	const originOf = (workspaceId: string | null) => {
		if (!workspaceId) return null;
		const local = workspaces.find((w) => w.id === workspaceId);
		if (local) {
			const project = projects.find((p) => p.id === local.projectId);
			return {
				name: local.name,
				iconUrl: project ? resolveProjectIconUrl(project) : null,
			};
		}
		const cloud = cloudWorkspaces?.find((w) => w.id === workspaceId);
		if (!cloud) return null;
		const repo = primaryRepositoryById.get(cloud.id);
		return {
			name: cloud.name,
			iconUrl: resolveProjectIconUrl({
				icon: null,
				repoOwner: repo?.split("/")[0] || null,
			}),
		};
	};

	const visible = useMemo(
		() =>
			(cards.data?.pages ?? [])
				.flatMap((page) => page.items)
				.filter((c) => !unreadOnly || c.readAt === null),
		[cards.data, unreadOnly],
	);

	type Card = (typeof visible)[number];
	const items = useMemo(
		() =>
			mergeInboxItems({
				cards: visible,
				finished,
				at: (card) =>
					view === "archive" && card.resolvedAt
						? card.resolvedAt
						: view === "scheduled" && card.showAt
							? card.showAt
							: card.createdAt,
			}),
		[visible, finished, view],
	);
	const idOf = (item: InboxItem<Card>) =>
		item.kind === "card"
			? item.card.id
			: finishedItemId(item.entry.workspaceId);
	const setOrder = useInboxSelectionStore((state) => state.setOrder);
	const order = items.map(idOf).join(" ");
	useEffect(() => {
		setOrder(order ? order.split(" ") : []);
	}, [order, setOrder]);
	const setCards = useInboxSelectionStore((state) => state.setCards);
	useEffect(() => {
		setCards(Object.fromEntries(visible.map((card) => [card.id, card])));
	}, [visible, setCards]);

	const groups = useMemo(() => {
		const byPeriod = new Map<string, { label: string; items: typeof items }>();
		for (const item of items) {
			const period = periodOf(item.at, now);
			const key = periodKey(period);
			const group = byPeriod.get(key) ?? {
				label: formatPeriod(period),
				items: [],
			};
			group.items.push(item);
			byPeriod.set(key, group);
		}
		return [...byPeriod.entries()].map(([key, group]) => ({ key, ...group }));
	}, [items, now]);

	const openSession = (card: Card) => {
		if (!card.workspaceId) return;
		void navigateToV2Workspace(card.workspaceId, navigate, {
			search: { terminalId: card.agentSessionId, focusRequestId: card.id },
		});
	};
	const settle = (card: Card, kind: "archived" | "answered") => {
		advanceFrom(card.id);
		resolve.mutate({ id: card.id, outcome: { kind } });
	};
	const archive = (item: InboxItem<Card>) => {
		if (item.kind === "card") {
			if (item.card.resolvedAt === null) settle(item.card, "archived");
			return;
		}
		advanceFrom(idOf(item));
		dismissFinished(item.entry);
	};
	const openSource = async (item: InboxItem<Card>) => {
		const document =
			item.kind === "card" && item.card.hasDocument
				? await utils.inbox.document
						.fetch({ id: item.card.id })
						.catch(() => null)
				: null;
		const target = inboxSourceTarget(
			item.kind === "finished"
				? { kind: "finished", workspaceId: item.entry.workspaceId }
				: {
						kind: "card",
						workspaceId: item.card.workspaceId,
						agentSessionId: item.card.agentSessionId,
						blocks: document?.blocks ?? null,
					},
		);
		if (target.kind === "url") openUrl.mutate(target.url);
		else if (target.kind === "workspace")
			void navigateToV2Workspace(target.workspaceId, navigate);
		else if (target.kind === "session")
			void navigateToV2Workspace(target.workspaceId, navigate, {
				search: { terminalId: target.terminalId, focusRequestId: idOf(item) },
			});
		else toast(t({ message: "This card has nothing to open in another app" }));
	};
	const selectedItem = () => {
		const { selectedId } = useInboxSelectionStore.getState();
		return items.find((item) => idOf(item) === selectedId);
	};
	// The open card's block holds keyboard focus while it rests there; the plain arrows are still the list's.
	useEffect(() => {
		if (!isEnabled || !isOpen) return;
		const onKeyDown = (event: KeyboardEvent) => {
			const step =
				event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
			const resting =
				event.target instanceof Element &&
				event.target.matches("[data-focus-block]");
			if (step === 0 || !resting || event.defaultPrevented) return;
			if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
				return;
			if (useHotkeyScopeStore.getState().active !== "inbox") return;
			event.preventDefault();
			move(step);
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [isEnabled, isOpen, move]);
	const whenFocused = { enabled: isEnabled && isOpen };
	useHotkey("INBOX_NEXT", () => move(1), whenFocused);
	useHotkey("INBOX_PREVIOUS", () => move(-1), whenFocused);
	useHotkey(
		"INBOX_ARCHIVE",
		() => {
			const item = selectedItem();
			if (item) archive(item);
		},
		whenFocused,
	);
	useHotkey(
		"INBOX_OPEN_SOURCE",
		() => {
			const item = selectedItem();
			if (item) void openSource(item);
		},
		whenFocused,
	);

	const renderCard = (card: Card) => (
		<InboxPanelCard
			key={card.id}
			card={card}
			view={view}
			now={now}
			workspaceName={originOf(card.workspaceId)?.name}
			projectIconUrl={originOf(card.workspaceId)?.iconUrl}
			onOpen={() => select(card.id)}
			onOpenSession={() => openSession(card)}
			onArchive={() => settle(card, "archived")}
			onMarkRead={(read) => markRead.mutate({ id: card.id, read })}
		/>
	);

	if (!isEnabled || !present) return null;

	const filtered = status !== "all" || !showUpdates || !showFinished;
	const TYPES = [
		{
			label: t({ message: "Agent finished" }),
			shown: showFinished,
			toggle: () => setShowFinished(!showFinished),
		},
		{
			label: t({ message: "Updates" }),
			shown: showUpdates,
			toggle: () => setShowUpdates(!showUpdates),
		},
	];
	const STATUS_LABEL: Record<InboxStatus, string> = {
		all: t({ message: "Unread & read" }),
		unread: t({ message: "Unread" }),
		archive: t({ message: "Archived" }),
		scheduled: t({ message: "Scheduled" }),
	};

	return (
		<div
			onTransitionEnd={(event) => {
				if (
					event.target === event.currentTarget &&
					event.propertyName === "width" &&
					!isOpen
				)
					setPresent(false);
			}}
			className={cn(
				"flex h-full shrink-0 overflow-hidden",
				!isResizing && "transition-[width] duration-200 ease-out",
			)}
			style={{ width: expanded ? width : 0 }}
		>
			<ResizablePanel
				width={width}
				onWidthChange={setWidth}
				isResizing={isResizing}
				onResizingChange={setIsResizing}
				minWidth={INBOX_PANEL_MIN_WIDTH}
				maxWidth={INBOX_PANEL_MAX_WIDTH}
				handleSide="right"
				onDoubleClickHandle={() => setWidth(INBOX_PANEL_DEFAULT_WIDTH)}
			>
				<InboxPrefetch enabled={isEnabled && isOpen} />
				<aside
					ref={panelRef}
					tabIndex={-1}
					onKeyDown={(event) => {
						const step =
							event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
						if (
							step === 0 ||
							event.metaKey ||
							event.ctrlKey ||
							event.altKey ||
							isTextEntryTarget(event.target)
						)
							return;
						event.preventDefault();
						move(step);
					}}
					className="flex h-full w-full flex-col border-r border-border bg-sidebar outline-none dark:bg-muted/35"
					aria-label={t({ message: "Inbox" })}
				>
					<div className="drag flex h-12 shrink-0 items-center gap-1 pr-2 pl-4">
						<h2 className="flex-1 text-[13px] font-semibold text-foreground">
							{status === "all" ? <Trans>Inbox</Trans> : STATUS_LABEL[status]}
						</h2>
						<DropdownMenu modal={false}>
							<Tooltip delayDuration={400}>
								<TooltipTrigger asChild>
									<DropdownMenuTrigger asChild>
										<ToolbarMenuButton
											isActive={filtered}
											className="no-drag size-6 p-0"
											aria-label={t({ message: "Filter" })}
										>
											<LuListFilter className="size-3.5" />
										</ToolbarMenuButton>
									</DropdownMenuTrigger>
								</TooltipTrigger>
								<TooltipContent side="bottom">
									<Trans>Filter</Trans>
								</TooltipContent>
							</Tooltip>
							<DropdownMenuContent align="end" className="w-60">
								<DropdownMenuLabel className="text-[11px] text-muted-foreground">
									<Trans>Status</Trans>
								</DropdownMenuLabel>
								{STATUSES.map(({ value, icon: Icon }) => (
									<DropdownMenuItem
										key={value}
										role="menuitemradio"
										aria-checked={status === value}
										onSelect={() => setStatus(value)}
										className="gap-2.5"
									>
										<span
											className={cn(
												"flex size-3.5 shrink-0 items-center justify-center rounded-full border",
												status === value
													? "border-foreground"
													: "border-muted-foreground/50",
											)}
										>
											{status === value && (
												<span className="size-1.5 rounded-full bg-foreground" />
											)}
										</span>
										<Icon className="size-3.5 text-muted-foreground" />
										{STATUS_LABEL[value]}
										{value === "scheduled" && counts.data?.scheduled ? (
											<span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
												{counts.data.scheduled}
											</span>
										) : null}
									</DropdownMenuItem>
								))}
								<DropdownMenuSeparator />
								<DropdownMenuLabel className="text-[11px] text-muted-foreground">
									<Trans>Type</Trans>
								</DropdownMenuLabel>
								{TYPES.map((type) => (
									<DropdownMenuItem
										key={type.label}
										role="menuitemcheckbox"
										aria-checked={type.shown}
										onSelect={(event) => {
											event.preventDefault();
											type.toggle();
										}}
										className="gap-2.5"
									>
										<span
											className={cn(
												"flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border",
												type.shown
													? "border-primary bg-primary text-primary-foreground"
													: "border-muted-foreground/50",
											)}
										>
											{type.shown && (
												<LuCheck className="size-2.5" strokeWidth={3} />
											)}
										</span>
										{type.label}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
						<Tooltip delayDuration={400}>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() => setOpen(false)}
									aria-label={t({ message: "Close inbox" })}
									className="no-drag flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
								>
									<LuX className="size-3.5" strokeWidth={1.5} />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								<Trans>Close inbox</Trans>
							</TooltipContent>
						</Tooltip>
					</div>

					<div className="border-b border-border" />

					<div
						ref={listRef}
						className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-3.5 pb-3 pl-3"
					>
						{cards.isPending ? (
							<div className="flex justify-center py-8">
								<Spinner className="size-4" />
							</div>
						) : groups.length > 0 ? (
							groups.map((group) => (
								<section key={group.key} className="flex flex-col gap-2">
									<h3 className="px-1 pt-3 pb-1 text-[11px] font-medium text-muted-foreground">
										{group.label}
									</h3>
									{group.items.map((item) =>
										item.kind === "card" ? (
											renderCard(item.card)
										) : (
											<FinishedWorkspaceRow
												key={item.entry.workspaceId}
												itemId={idOf(item)}
												workspaceName={
													originOf(item.entry.workspaceId)?.name ??
													t({ message: "Workspace" })
												}
												finishedAt={item.at}
												now={now}
												note={item.card?.body ?? item.card?.why}
												onOpen={() => select(idOf(item))}
												onDismiss={() => archive(item)}
											/>
										),
									)}
								</section>
							))
						) : (
							<p className="px-1 py-8 text-center text-xs text-muted-foreground">
								{status === "unread" ? (
									<Trans>Nothing unread.</Trans>
								) : view === "open" ? (
									<Trans>Nothing needs you right now.</Trans>
								) : view === "scheduled" ? (
									<Trans>Nothing is waiting for a later date.</Trans>
								) : (
									<Trans>Nothing archived yet.</Trans>
								)}
							</p>
						)}
						<div ref={sentinelRef} />
						{isFetchingNextPage && (
							<div className="flex justify-center py-3">
								<Spinner className="size-4" />
							</div>
						)}
					</div>
				</aside>
			</ResizablePanel>
		</div>
	);
}
