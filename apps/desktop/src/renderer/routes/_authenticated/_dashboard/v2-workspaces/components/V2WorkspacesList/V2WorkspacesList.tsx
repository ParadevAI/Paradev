import { Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Button } from "@superset/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@superset/ui/empty";
import { cn } from "@superset/ui/utils";
import { useMatchRoute } from "@tanstack/react-router";
import { type Range, useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useMemo, useRef, useState } from "react";
import {
	LuArchive,
	LuChevronDown,
	LuChevronRight,
	LuLayers,
	LuMonitor,
	LuSearchX,
	LuTerminal,
} from "react-icons/lu";
import { BoardColumnIcon } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/BoardColumnIcon";
import { V2WorkspaceProjectIcon } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/V2WorkspaceProjectIcon";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { useCurrentViewFilters } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useCurrentViewFilters";
import {
	BUILT_IN_VIEW_ALL,
	getViewFilters,
	sameViewFilters,
	useV2WorkspacesFilterStore,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { BOARD_COLUMN_LABELS } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/deriveBoardColumn";
import {
	GROUP_KEY_ARCHIVED,
	GROUP_KEY_CLOUD,
	groupWorkspaces,
	type WorkspaceSection,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/groupWorkspaces";
import {
	activeHeaderIndex,
	pinnedHeaderRange,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/pinnedHeaderRange";
import { CloudGlyph } from "renderer/routes/_authenticated/components/CloudGlyph";
import { useV2ProjectLocalMetaStore } from "renderer/stores/v2-project-local-meta";
import { V2WorkspaceRow } from "./components/V2WorkspaceRow";

interface V2WorkspacesListProps {
	workspaces: AccessibleV2Workspace[];
	isReady: boolean;
}

const ESTIMATED_HEADER_HEIGHT = 30;
const ESTIMATED_ROW_HEIGHT = 45;
const OVERSCAN = 8;

type ListItem =
	| {
			kind: "header";
			key: string;
			section: WorkspaceSection;
			collapseKey: string;
			isCollapsed: boolean;
			containsCurrent: boolean;
	  }
	| { kind: "row"; key: string; workspace: AccessibleV2Workspace };

export function V2WorkspacesList({
	workspaces,
	isReady,
}: V2WorkspacesListProps) {
	const matchRoute = useMatchRoute();
	const currentWorkspaceMatch = matchRoute({
		to: "/v2-workspace/$workspaceId",
	});
	const currentWorkspaceId =
		currentWorkspaceMatch !== false ? currentWorkspaceMatch.workspaceId : null;

	const searchQuery = useV2WorkspacesFilterStore((state) => state.searchQuery);
	const activeViewId = useV2WorkspacesFilterStore(
		(state) => state.activeViewId,
	);
	const savedViews = useV2WorkspacesFilterStore((state) => state.savedViews);
	const currentFilters = useCurrentViewFilters();
	const applyView = useV2WorkspacesFilterStore((state) => state.applyView);
	const setSearchQuery = useV2WorkspacesFilterStore(
		(state) => state.setSearchQuery,
	);
	const showArchived = useV2WorkspacesFilterStore(
		(state) => state.showArchived,
	);
	const groupBy = useV2WorkspacesFilterStore((state) => state.groupBy);
	const orderBy = useV2WorkspacesFilterStore((state) => state.orderBy);
	// Status sections persist their collapse in the project-meta store under a
	// fixed seven-key set; project, host and creator keys have no deletion
	// path in that store, so they only collapse for the session.
	const persistedCollapsed = useV2ProjectLocalMetaStore(
		(state) => state.projects,
	);
	const togglePersistedCollapsed = useV2ProjectLocalMetaStore(
		(state) => state.toggleProjectCollapsed,
	);
	const [sessionCollapsed, setSessionCollapsed] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	const toggleCollapsed = useCallback(
		(collapseKey: string) => {
			if (collapseKey.startsWith("status:")) {
				togglePersistedCollapsed(collapseKey);
				return;
			}
			setSessionCollapsed((current) => {
				const next = new Set(current);
				if (next.has(collapseKey)) next.delete(collapseKey);
				else next.add(collapseKey);
				return next;
			});
		},
		[togglePersistedCollapsed],
	);

	const sections = useMemo(
		() => groupWorkspaces(workspaces, { groupBy, orderBy, showArchived }),
		[workspaces, groupBy, orderBy, showArchived],
	);

	// One flat header/row sequence for the virtualizer; collapsed sections
	// contribute their header only.
	const items = useMemo<ListItem[]>(() => {
		const list: ListItem[] = [];
		for (const section of sections) {
			const collapseKey = `${section.groupBy}:${section.key}`;
			const containsCurrent = section.workspaces.some(
				(workspace) => workspace.id === currentWorkspaceId,
			);
			const wantsCollapsed =
				section.groupBy === "status"
					? (persistedCollapsed[collapseKey]?.isCollapsed ?? false)
					: sessionCollapsed.has(collapseKey);
			const isCollapsed = wantsCollapsed && !containsCurrent;
			// Flat list: no band, except the archived tail, which keeps its own.
			if (section.groupBy === "none" && section.key !== GROUP_KEY_ARCHIVED) {
				for (const workspace of section.workspaces) {
					list.push({ kind: "row", key: workspace.id, workspace });
				}
				continue;
			}
			list.push({
				kind: "header",
				key: `header:${collapseKey}`,
				section,
				collapseKey,
				isCollapsed,
				containsCurrent,
			});
			if (isCollapsed) continue;
			for (const workspace of section.workspaces) {
				list.push({ kind: "row", key: workspace.id, workspace });
			}
		}
		return list;
	}, [sections, persistedCollapsed, sessionCollapsed, currentWorkspaceId]);

	const headerIndexes = useMemo(
		() =>
			items.flatMap((item, index) => (item.kind === "header" ? [index] : [])),
		[items],
	);

	const scrollRef = useRef<HTMLDivElement>(null);
	const rangeExtractor = useCallback(
		(range: Range) => pinnedHeaderRange(range, headerIndexes),
		[headerIndexes],
	);
	const virtualizer = useVirtualizer({
		count: items.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: (index) =>
			items[index]?.kind === "header"
				? ESTIMATED_HEADER_HEIGHT
				: ESTIMATED_ROW_HEIGHT,
		getItemKey: (index) => items[index]?.key ?? index,
		overscan: OVERSCAN,
		rangeExtractor,
	});

	// Anything the user can undo from here: a search, or filters beyond
	// what the plain "All" view pins.
	const hasActiveFilters =
		searchQuery.trim() !== "" ||
		activeViewId !== BUILT_IN_VIEW_ALL ||
		!sameViewFilters(
			currentFilters,
			getViewFilters(BUILT_IN_VIEW_ALL, savedViews),
		);

	// Sections, not the input rows: the archived window can drop everything.
	if (sections.length === 0) {
		// A host that hasn't answered yet must not read as empty (cache-first rule).
		if (!isReady) return <div className="min-h-0 flex-1" />;
		return (
			<Empty className="flex-1 border-0">
				<EmptyHeader>
					<EmptyMedia
						variant="icon"
						className="size-14 [&_svg:not([class*='size-'])]:size-7"
					>
						{hasActiveFilters ? <LuSearchX /> : <LuLayers />}
					</EmptyMedia>
					<EmptyTitle>
						{hasActiveFilters ? (
							<Trans>No workspaces match your filters</Trans>
						) : (
							<Trans>No workspaces yet</Trans>
						)}
					</EmptyTitle>
					<EmptyDescription>
						{hasActiveFilters ? (
							<Trans>Try a different search term or another place.</Trans>
						) : (
							<Trans>Workspaces you can open will show up here.</Trans>
						)}
					</EmptyDescription>
				</EmptyHeader>
				{hasActiveFilters ? (
					<EmptyContent>
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								setSearchQuery("");
								applyView(BUILT_IN_VIEW_ALL);
							}}
						>
							<Trans>Clear filters</Trans>
						</Button>
					</EmptyContent>
				) : null}
			</Empty>
		);
	}

	return (
		// @container so rows can shed metadata as the pane narrows.
		<div ref={scrollRef} className="@container min-h-0 flex-1 overflow-y-auto">
			<div
				className="relative w-full"
				style={{ height: virtualizer.getTotalSize() }}
			>
				{virtualizer.getVirtualItems().map((virtualItem) => {
					const item = items[virtualItem.index];
					if (!item) return null;
					const isActiveHeader =
						item.kind === "header" &&
						virtualItem.index ===
							activeHeaderIndex(
								virtualizer.range?.startIndex ?? 0,
								headerIndexes,
							);
					return (
						<div
							key={virtualItem.key}
							data-index={virtualItem.index}
							ref={virtualizer.measureElement}
							className={cn("w-full", item.kind === "header" && "z-[5]")}
							style={
								isActiveHeader
									? { position: "sticky", top: 0 }
									: {
											position: "absolute",
											top: 0,
											left: 0,
											transform: `translateY(${virtualItem.start}px)`,
										}
							}
						>
							{item.kind === "header" ? (
								<SectionHeader
									section={item.section}
									isCollapsed={item.isCollapsed}
									containsCurrent={item.containsCurrent}
									onToggle={() => toggleCollapsed(item.collapseKey)}
								/>
							) : (
								<V2WorkspaceRow
									workspace={item.workspace}
									isCurrentRoute={item.workspace.id === currentWorkspaceId}
								/>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

interface SectionHeaderProps {
	section: WorkspaceSection;
	isCollapsed: boolean;
	containsCurrent: boolean;
	onToggle: () => void;
}

function SectionHeader({
	section,
	isCollapsed,
	containsCurrent,
	onToggle,
}: SectionHeaderProps) {
	const { t } = useLingui();
	const Chevron = isCollapsed ? LuChevronRight : LuChevronDown;

	return (
		// The toggle is inert for the current workspace's section (it never
		// hides), so it is disabled instead of letting clicks appear to do nothing.
		<button
			type="button"
			onClick={onToggle}
			disabled={containsCurrent}
			title={
				containsCurrent
					? t({ message: "Can't collapse the current workspace's section" })
					: undefined
			}
			aria-expanded={!isCollapsed}
			className="relative flex w-full items-center gap-1.5 border-b border-border/60 bg-muted/70 px-6 py-1.5 text-left outline-none backdrop-blur transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
		>
			<Chevron className="absolute left-1.5 size-2.5 shrink-0 text-muted-foreground/60" />
			<span aria-hidden className="flex w-3 shrink-0 items-center">
				<SectionGlyph section={section} />
			</span>
			<h3 className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
				<SectionLabel section={section} />
			</h3>
			<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
				{section.workspaces.length}
			</span>
		</button>
	);
}

function SectionLabel({ section }: { section: WorkspaceSection }) {
	const { sample } = section;
	if (section.key === GROUP_KEY_ARCHIVED) return <Trans>Archived</Trans>;
	switch (section.groupBy) {
		case "status":
			return section.column
				? i18n._(BOARD_COLUMN_LABELS[section.column])
				: null;
		case "project":
			return sample.projectName ?? <Trans>Sessions</Trans>;
		case "where":
			return section.key === GROUP_KEY_CLOUD ? (
				<Trans>Cloud</Trans>
			) : (
				sample.hostName
			);
		case "creator":
			return sample.createdByName ?? <Trans>Unknown creator</Trans>;
		default:
			return null;
	}
}

function SectionGlyph({ section }: { section: WorkspaceSection }) {
	const { sample } = section;
	if (section.key === GROUP_KEY_ARCHIVED) {
		return <LuArchive className="size-3 text-muted-foreground/70" />;
	}
	switch (section.groupBy) {
		case "status":
			return section.column ? (
				<BoardColumnIcon column={section.column} className="justify-start" />
			) : null;
		case "project":
			return sample.projectId ? (
				<V2WorkspaceProjectIcon
					projectName={sample.projectName ?? ""}
					iconUrl={sample.projectIconUrl}
					size="sm"
					className="size-4 rounded-sm text-[9px]"
				/>
			) : (
				<LuTerminal className="size-3.5 text-muted-foreground" />
			);
		case "where":
			return section.key === GROUP_KEY_CLOUD ? (
				<CloudGlyph className="size-3.5 text-muted-foreground" />
			) : (
				<LuMonitor className="size-3.5 text-muted-foreground" />
			);
		case "creator":
			return (
				<Avatar className="size-4">
					{sample.createdByImage ? (
						<AvatarImage src={sample.createdByImage} />
					) : null}
					<AvatarFallback className="text-[8px]">
						{(sample.createdByName ?? "?").slice(0, 1).toUpperCase()}
					</AvatarFallback>
				</Avatar>
			);
		default:
			return null;
	}
}
