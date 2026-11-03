import {
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	MouseSensor,
	pointerWithin,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { plural } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { errorMessage } from "@superset/i18n/errors";
import { COMPANY } from "@superset/shared/constants";
import { describeSchedule } from "@superset/shared/rrule";
import type { RouterOutputs } from "@superset/trpc";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@superset/ui/empty";
import { Input } from "@superset/ui/input";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { cn } from "@superset/ui/utils";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
	LuArrowUpRight,
	LuRotateCw,
	LuSearch,
	LuSearchX,
	LuTerminal,
	LuTriangleAlert,
	LuX,
} from "react-icons/lu";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { useRecentProjects } from "renderer/hooks/host-projects/useRecentProjects";
import { useCreateAgentSession } from "renderer/hooks/useCreateAgentSession";
import { useNow } from "renderer/hooks/useNow";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { DATA_TABLE_HEAD_CELL } from "renderer/routes/_authenticated/_dashboard/components/DataTableHeader";
import { FeatureHeader } from "renderer/routes/_authenticated/_dashboard/components/FeatureHeader";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import {
	SortableHeader,
	type SortDirection,
} from "renderer/routes/_authenticated/_dashboard/components/SortableHeader";
import { useCreateAutomation } from "renderer/routes/_authenticated/_dashboard/hooks/useCreateAutomation";
import { useFailedAutomations } from "renderer/routes/_authenticated/_dashboard/hooks/useFailedAutomations";
import { useIsOrganizationOwner } from "renderer/routes/_authenticated/hooks/useIsOrganizationOwner";
import { AutomationBulkBar } from "./components/AutomationBulkBar";
import { AutomationDragPreview } from "./components/AutomationDragPreview";
import { AutomationGroupHeaderRow } from "./components/AutomationGroupHeaderRow";
import { AutomationRow } from "./components/AutomationRow";
import { AutomationStatCards } from "./components/AutomationStatCards";
import { AutomationsEmptyState } from "./components/AutomationsEmptyState";
import { HostOfflineRunDialog } from "./components/HostOfflineRunDialog";
import { useRowSelection } from "./hooks/useRowSelection";
import { useSetAutomationGroup } from "./hooks/useSetAutomationGroup";
import type { AutomationTemplate } from "./templates";
import {
	groupAutomations,
	listAutomationGroups,
} from "./utils/groupAutomations";
import { dispatchErrorCode, runErrorHelp } from "./utils/runErrorHelp";
import { RUN_STATUS_META } from "./utils/runStatus";
import { snapToCursor } from "./utils/snapToCursor";

export const Route = createFileRoute("/_authenticated/_dashboard/automations/")(
	{
		component: AutomationsPage,
	},
);

type Scope = "mine" | "team";

type AutomationListItem = RouterOutputs["automation"]["list"][number];

type AutomationSortField = "name" | "owner" | "schedule" | "status" | "lastRun";

type LastRunSortMode = "time" | "result";

const LAST_RUN_SORT_CYCLE: {
	mode: LastRunSortMode;
	direction: SortDirection;
}[] = [
	{ mode: "time", direction: "desc" },
	{ mode: "time", direction: "asc" },
	{ mode: "result", direction: "asc" },
	{ mode: "result", direction: "desc" },
];

const UNGROUPED_KEY = "\u0000ungrouped";

// Seeds the "Create with AI" agent session. The skill is provisioned as
// superset:automate; mentioning it by name loads it (it isn't in the chat
// slash-command allowlist).
const AUTOMATION_AGENT_PROMPT =
	"Help me create a Paradev automation. Use the superset:automate skill if it's available, otherwise the `superset` CLI (start with `superset automations --help`). Ask me what the automation should do and what should fire it — a schedule, or an event like a Slack message, GitHub pull request, or Linear issue. Confirm that, the target project, and the agent, then create the automation and trigger a first run so we can review the result together.";

function AutomationsPage() {
	const { t } = useLingui();
	const { data: session } = authClient.useSession();
	const currentUserId = session?.user?.id;
	const isOrgOwner = useIsOrganizationOwner();

	const [scope, setScope] = useState<Scope>("mine");
	const [search, setSearch] = useState("");
	const [cliHintDismissed, setCliHintDismissed] = useState(false);
	const [pendingDelete, setPendingDelete] = useState<
		AutomationListItem[] | null
	>(null);
	const [pendingGroupDelete, setPendingGroupDelete] = useState<{
		group: string;
		ids: string[];
	} | null>(null);
	const [hostOfflineRun, setHostOfflineRun] = useState<{
		hostId: string | null;
	} | null>(null);
	const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
		new Set(),
	);
	const { setGroup } = useSetAutomationGroup();

	const toggleGroupCollapsed = (key: string) =>
		setCollapsedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});

	const addRetrying = useCallback((ids: string[]) => {
		setRetryingIds((prev) => {
			const next = new Set(prev);
			for (const id of ids) next.add(id);
			return next;
		});
	}, []);
	const removeRetrying = useCallback((ids: string[]) => {
		setRetryingIds((prev) => {
			const next = new Set(prev);
			for (const id of ids) next.delete(id);
			return next;
		});
	}, []);

	const runNowMutation = useMutation({
		mutationFn: ({
			id,
		}: {
			id: string;
			name: string;
			targetHostId: string | null;
		}) => apiTrpcClient.automation.runNow.mutate({ id }),
		onMutate: ({ id }) => addRetrying([id]),
		onSettled: (_data, _error, { id }) => removeRetrying([id]),
		onSuccess: (_, { name }) =>
			toast.success(
				t({
					message: `Running "${name}" now`,
				}),
			),
		onError: (error, { targetHostId }) => {
			const code = dispatchErrorCode(error);
			if (code === "host_offline") {
				setHostOfflineRun({ hostId: targetHostId });
				return;
			}
			const help = runErrorHelp(code);
			if (help) {
				toast.error(i18n._(help));
				return;
			}
			toast.error(
				(error instanceof Error ? error.message : null) ??
					t({
						message: "Failed to trigger run",
					}),
			);
		},
	});

	const utils = cloudTrpc.useUtils();

	const setEnabledMutation = useMutation({
		mutationFn: ({
			id,
			enabled,
		}: {
			id: string;
			enabled: boolean;
			name: string;
		}) => apiTrpcClient.automation.setEnabled.mutate({ id, enabled }),
		onSuccess: (_, { id, enabled, name }) => {
			void utils.automation.list.invalidate();
			void utils.automation.get.invalidate({ id });
			toast.success(
				enabled
					? t({
							message: `"${name}" resumed`,
						})
					: t({
							message: `"${name}" paused`,
						}),
			);
		},
		onError: (error) =>
			toast.error(
				errorMessage(
					error,
					t({
						message: "Failed to update automation",
					}),
				),
			),
	});

	const bulkEnabledMutation = useMutation({
		mutationFn: async ({
			ids,
			enabled,
		}: {
			ids: string[];
			enabled: boolean;
		}) => {
			const results = await Promise.allSettled(
				ids.map((id) =>
					apiTrpcClient.automation.setEnabled.mutate({ id, enabled }),
				),
			);
			const failed = results.find((result) => result.status === "rejected");
			if (failed) throw failed.reason;
		},
		onSuccess: (_, { ids, enabled }) =>
			toast.success(
				enabled
					? t({
							message: plural(ids.length, {
								one: "# automation resumed",
								other: "# automations resumed",
							}),
						})
					: t({
							message: plural(ids.length, {
								one: "# automation paused",
								other: "# automations paused",
							}),
						}),
			),
		onError: (error) =>
			toast.error(
				errorMessage(error, t({ message: "Failed to update automation" })),
			),
		onSettled: (_data, _error, { ids }) => {
			void utils.automation.list.invalidate();
			for (const id of ids) void utils.automation.get.invalidate({ id });
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async (targets: AutomationListItem[]) => {
			const results = await Promise.allSettled(
				targets.map(({ id }) => apiTrpcClient.automation.delete.mutate({ id })),
			);
			const failed = results.find((result) => result.status === "rejected");
			if (failed) throw failed.reason;
		},
		onSuccess: (_, targets) => {
			setPendingDelete(null);
			const [only] = targets;
			toast.success(
				targets.length === 1 && only
					? t({ message: `"${only.name}" deleted` })
					: t({
							message: plural(targets.length, {
								one: "# automation deleted",
								other: "# automations deleted",
							}),
						}),
			);
		},
		onSettled: () => void utils.automation.list.invalidate(),
		onError: (error) =>
			toast.error(
				errorMessage(
					error,
					t({
						message: "Failed to delete automation",
					}),
				),
			),
	});

	const {
		data: automations = [],
		isPending: automationsPending,
		isError: automationsFailed,
		error: automationsError,
		refetch: refetchAutomations,
	} = cloudTrpc.automation.list.useQuery(undefined, {
		refetchInterval: 60_000,
	});

	const { data: memberRows = [] } = cloudTrpc.organization.listMembers.useQuery(
		undefined,
		{},
	);
	const { lastRunById } = useFailedAutomations();
	const now = useNow(30_000);

	const recentProjects = useRecentProjects();

	const usersById = useMemo(
		() => new Map(memberRows.map((member) => [member.user.id, member.user])),
		[memberRows],
	);
	const projectsById = useMemo(
		() =>
			new Map(recentProjects.filter((p) => p != null).map((p) => [p.id, p])),
		[recentProjects],
	);

	const mineCount = useMemo(
		() =>
			currentUserId
				? automations.filter((a) => a.ownerUserId === currentUserId).length
				: 0,
		[automations, currentUserId],
	);
	const teamCount = automations.length - mineCount;

	const tabVisible = useMemo(() => {
		if (!currentUserId) return automations;
		return scope === "mine"
			? automations.filter((a) => a.ownerUserId === currentUserId)
			: automations.filter((a) => a.ownerUserId !== currentUserId);
	}, [automations, scope, currentUserId]);

	const visible = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return tabVisible;
		return tabVisible.filter((a) => a.name.toLowerCase().includes(query));
	}, [tabVisible, search]);

	// Org-wide on purpose: the cards describe the org's automation health and
	// link into the org-wide All runs views, so the Mine/Team tabs only
	// filter the table.
	const { data: orgRunStats } = cloudTrpc.automation.orgRunStats.useQuery(
		undefined,
		{ staleTime: 30_000 },
	);

	const [sortField, setSortField] = useState<AutomationSortField | null>(null);
	const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

	const [lastRunSortMode, setLastRunSortMode] =
		useState<LastRunSortMode>("time");

	const handleSort = (field: AutomationSortField) => {
		if (field === "lastRun") {
			const current = LAST_RUN_SORT_CYCLE.findIndex(
				(step) =>
					sortField === "lastRun" &&
					step.mode === lastRunSortMode &&
					step.direction === sortDirection,
			);
			const next =
				LAST_RUN_SORT_CYCLE[(current + 1) % LAST_RUN_SORT_CYCLE.length];
			setSortField("lastRun");
			setLastRunSortMode(next.mode);
			setSortDirection(next.direction);
			return;
		}
		if (sortField === field) {
			setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
		} else {
			setSortField(field);
			setSortDirection("asc");
		}
	};

	const handleScopeChange = (value: string) => {
		if (!value) return;
		const next = value as Scope;
		setScope(next);
		clearSelection();
		// The Owner column only exists on the team tab; drop the sort with it.
		if (next !== "team" && sortField === "owner") setSortField(null);
	};

	const sortedVisible = useMemo(() => {
		if (!sortField) return visible;
		if (sortField === "lastRun") {
			// Never-run automations stay at the bottom in both directions.
			return [...visible].sort((a, b) => {
				const aRun = lastRunById.get(a.id);
				const bRun = lastRunById.get(b.id);
				if (!aRun || !bRun) return aRun === bRun ? 0 : aRun ? -1 : 1;
				if (lastRunSortMode === "time") {
					return sortDirection === "asc"
						? aRun.at - bRun.at
						: bRun.at - aRun.at;
				}
				const cmp =
					RUN_STATUS_META[aRun.status].sortRank -
					RUN_STATUS_META[bRun.status].sortRank;
				if (cmp !== 0) return sortDirection === "asc" ? cmp : -cmp;
				return bRun.at - aRun.at;
			});
		}
		const sortValue = (automation: AutomationListItem): string => {
			switch (sortField) {
				case "name":
					return automation.name;
				case "owner": {
					const owner = usersById.get(automation.ownerUserId);
					return owner?.name ?? owner?.email ?? "";
				}
				case "schedule":
					return automation.rrule
						? describeSchedule(automation.rrule)
						: automation.triggerCount > 0
							? "Event triggered"
							: "No triggers";
				case "status":
					return automation.enabled ? "active" : "paused";
			}
		};
		return [...visible].sort((a, b) => {
			const cmp = sortValue(a).localeCompare(sortValue(b));
			return sortDirection === "asc" ? cmp : -cmp;
		});
	}, [
		visible,
		sortField,
		sortDirection,
		usersById,
		lastRunById,
		lastRunSortMode,
	]);

	const groups = useMemo(
		() => listAutomationGroups(automations),
		[automations],
	);
	// Flat until some automation in this tab has a group.
	const sections = useMemo(
		() =>
			tabVisible.some((a) => a.group) ? groupAutomations(sortedVisible) : null,
		[tabVisible, sortedVisible],
	);

	// Only your own automations take actions, so only Mine selects.
	const selectable = scope === "mine";
	const shownOrder = useMemo(() => {
		if (!selectable) return [];
		const rows = sections
			? sections.flatMap(({ group, items }) =>
					collapsedGroups.has(group ?? UNGROUPED_KEY) ? [] : items,
				)
			: sortedVisible;
		return rows.map((row) => row.id);
	}, [selectable, sections, sortedVisible, collapsedGroups]);
	const {
		selected,
		toggle: toggleSelected,
		setMany: setSelectedMany,
		clear: clearSelection,
	} = useRowSelection(shownOrder);
	const selectedRows = useMemo(
		() => automations.filter((a) => selected.has(a.id)),
		[automations, selected],
	);
	const selectionActive = selected.size > 0;
	// Rows sit under a group header, or make room for checkboxes.
	const indentRows = sections !== null || selectionActive;

	// Dragging rows between sections changes their group, as in Linear.
	const canDrag = selectable && sections !== null;
	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
	);
	const [dragIds, setDragIds] = useState<string[] | null>(null);
	const [overGroupKey, setOverGroupKey] = useState<string | null>(null);
	const draggedRows = useMemo(
		() => (dragIds ? automations.filter((a) => dragIds.includes(a.id)) : []),
		[automations, dragIds],
	);
	const groupKeyOf = (group: string | null) => group ?? UNGROUPED_KEY;
	// A section lights up only when dropping there would move something.
	const dropActiveFor = (group: string | null) =>
		dragIds !== null &&
		overGroupKey === groupKeyOf(group) &&
		draggedRows.some((a) => a.group !== group);

	const endDrag = () => {
		setDragIds(null);
		setOverGroupKey(null);
	};
	const handleDragStart = ({ active }: DragStartEvent) => {
		const id = String(active.id);
		setDragIds(
			selected.has(id)
				? shownOrder.filter((rowId) => selected.has(rowId))
				: [id],
		);
	};
	const handleDragOver = ({ over }: DragOverEvent) => {
		const group = over?.data.current?.group as string | null | undefined;
		setOverGroupKey(group === undefined ? null : groupKeyOf(group));
	};
	const handleDragEnd = ({ over }: DragEndEvent) => {
		// The drop's mouseup would otherwise also click the row under it.
		const swallowClick = (event: MouseEvent) => {
			event.stopPropagation();
			event.preventDefault();
		};
		window.addEventListener("click", swallowClick, {
			capture: true,
			once: true,
		});
		setTimeout(
			() => window.removeEventListener("click", swallowClick, true),
			0,
		);

		const target = over?.data.current?.group as string | null | undefined;
		const moving = draggedRows.filter((a) => a.group !== target);
		endDrag();
		if (target === undefined || moving.length === 0) return;
		const [only] = moving;
		setGroup({
			ids: moving.map((a) => a.id),
			name: moving.length === 1 ? only?.name : undefined,
			group: target,
		});
	};
	const allShownSelected =
		shownOrder.length > 0 && selected.size === shownOrder.length;

	useEffect(() => {
		if (!selectable) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented) return;
			if (
				document.querySelector("[role=menu],[role=dialog],[role=alertdialog]")
			) {
				return;
			}
			const target = event.target as HTMLElement | null;
			const typing =
				target?.closest("input, textarea, [contenteditable=true]") != null;
			if (event.key === "Escape" && selected.size > 0) {
				clearSelection();
			} else if (
				!typing &&
				event.key === "a" &&
				(event.metaKey || event.ctrlKey)
			) {
				event.preventDefault();
				setSelectedMany(shownOrder, true);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [selectable, selected, shownOrder, clearSelection, setSelectedMany]);

	const pendingDeleteOnly =
		pendingDelete?.length === 1 ? pendingDelete[0] : undefined;

	const navigate = useNavigate();
	const { createSession, isPending: creatingWithAgent } =
		useCreateAgentSession();
	// Automations are Pro. Creating, running, and resuming go through the
	// paywall; the server refuses the same three, so this is the friendly
	// front of one gate. Pausing, editing, and deleting stay open so a
	// downgraded org keeps control of what it has.
	const { gateFeature, hasAccess, isReady: planReady } = usePaywall();
	const showProBadge = planReady && !hasAccess(GATED_FEATURES.AUTOMATIONS);

	const { create: createAutomation, isPending: creatingAutomation } =
		useCreateAutomation();
	const recentProjectId = recentProjects.find((p) => p != null)?.id ?? null;

	const handleSelectTemplate = (template: AutomationTemplate) =>
		createAutomation({
			name: i18n._(template.name),
			prompt: template.prompt,
			agent: template.agentType,
			projectId: recentProjectId,
			rrule: template.rrule,
		});

	const handleCreateManually = () =>
		createAutomation({ prompt: "", projectId: recentProjectId });

	const handleCreateWithAgent = () => {
		if (creatingWithAgent) return;
		gateFeature(
			GATED_FEATURES.AUTOMATIONS,
			() => void createSession(AUTOMATION_AGENT_PROMPT),
		);
	};

	const scheduleWidth = scope === "team" ? "w-[16%]" : "w-[18%]";
	const lastRunWidth = "w-[14%]";
	const statusWidth = scope === "team" ? "w-[12%]" : "w-[13%]";
	const columnCount = scope === "team" ? 6 : 5;
	const showAutomationLoading = automationsPending && tabVisible.length === 0;
	// A failed read has no rows either, but it is not an empty org — it must not
	// strip the page chrome or claim the org has no automations.
	const showAutomationError = automationsFailed && automations.length === 0;
	// True first run: nothing in the org — stats/tabs/search are noise.
	const orgEmpty =
		!automationsPending && !showAutomationError && automations.length === 0;
	const tabEmpty =
		!automationsPending && !showAutomationError && tabVisible.length === 0;
	const showMineEmptyState = tabEmpty && scope === "mine";
	const showTeamEmptyState = tabEmpty && scope === "team";

	const renderAutomationRow = (automation: AutomationListItem) => (
		<AutomationRow
			key={automation.id}
			automation={automation}
			owner={usersById.get(automation.ownerUserId)}
			showOwner={scope === "team"}
			project={
				automation.v2ProjectId === null
					? undefined
					: projectsById.get(automation.v2ProjectId)
			}
			isSession={automation.v2ProjectId === null}
			lastRun={lastRunById.get(automation.id) ?? null}
			now={now}
			isOwner={automation.ownerUserId === currentUserId}
			canDelete={automation.ownerUserId === currentUserId || isOrgOwner}
			isRetrying={retryingIds.has(automation.id)}
			groups={groups}
			indented={indentRows}
			drag={
				canDrag
					? {
							enabled: true,
							dimmed: dragIds?.includes(automation.id) ?? false,
							dropActive: dropActiveFor(automation.group),
						}
					: undefined
			}
			selection={
				selectable
					? {
							selected: selected.has(automation.id),
							active: selectionActive,
							onSelect: (event) => toggleSelected(automation.id, event),
						}
					: undefined
			}
			onMoveToGroup={(a, group) =>
				setGroup({ ids: [a.id], name: a.name, group })
			}
			onRunNow={(a) =>
				gateFeature(GATED_FEATURES.AUTOMATIONS, () =>
					runNowMutation.mutate({
						id: a.id,
						name: a.name,
						targetHostId: a.targetHostId,
					}),
				)
			}
			onToggleEnabled={(a) => {
				const toggle = () =>
					setEnabledMutation.mutate({
						id: a.id,
						enabled: !a.enabled,
						name: a.name,
					});
				if (a.enabled) toggle();
				else gateFeature(GATED_FEATURES.AUTOMATIONS, toggle);
			}}
			onDelete={(a) => setPendingDelete([a])}
		/>
	);

	return (
		<div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
			<PageHeader />

			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-8 pt-4 pb-12">
					<FeatureHeader
						title={<Trans>Automations</Trans>}
						docsUrl={`${COMPANY.DOCS_URL}/automations`}
						onCreate={handleCreateWithAgent}
						isCreating={creatingWithAgent}
						showCreate={!orgEmpty}
						createDescription={<Trans>Describe the work to your agent</Trans>}
						primaryAction={{
							label: <Trans>New automation</Trans>,
							onSelect: handleCreateManually,
							disabled: creatingAutomation,
						}}
					/>

					{/* Stats are org-wide, so they stay put while the tabs swap;
					    only a truly empty org drops them. */}
					{!orgEmpty && (
						<div className="mt-5">
							{showAutomationLoading ? (
								<div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
									{["a", "b", "c", "d", "e"].map((key) => (
										<Skeleton key={key} className="h-[70px] w-full" />
									))}
								</div>
							) : (
								<AutomationStatCards
									totalAutomations={automations.length}
									succeeded7d={orgRunStats?.succeeded ?? 0}
									failed7d={orgRunStats?.failed ?? 0}
									missed7d={orgRunStats?.missed ?? 0}
									buckets={orgRunStats?.buckets ?? []}
									onShowFailed={() =>
										navigate({
											to: "/automations/runs",
											search: { status: "failed", scope: "all" },
										})
									}
									onShowMissed={() =>
										navigate({
											to: "/automations/runs",
											search: { status: "missed", scope: "all" },
										})
									}
									onShowHistory={() =>
										navigate({
											to: "/automations/runs",
											search: { scope: "all" },
										})
									}
								/>
							)}
						</div>
					)}

					{!orgEmpty && (
						<div className="mt-6 flex items-center justify-between gap-2">
							<Tabs value={scope} onValueChange={handleScopeChange}>
								<TabsList className="h-8 bg-transparent p-0 gap-1">
									<TabsTrigger
										value="mine"
										className="h-8 rounded-md px-3 data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
									>
										<span className="text-sm">
											<Trans>Mine</Trans>
										</span>
										<span className="ml-1 tabular-nums text-xs text-muted-foreground">
											{mineCount}
										</span>
									</TabsTrigger>
									<TabsTrigger
										value="team"
										className="h-8 rounded-md px-3 data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
									>
										<span className="text-sm">
											<Trans>Team</Trans>
										</span>
										<span className="ml-1 tabular-nums text-xs text-muted-foreground">
											{teamCount}
										</span>
									</TabsTrigger>
								</TabsList>
							</Tabs>
							<div className="flex items-center gap-2">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-8 gap-1.5 px-3 text-muted-foreground hover:text-foreground"
									onClick={() =>
										navigate({
											to: "/automations/runs",
											search: { scope: scope === "mine" ? "mine" : "all" },
										})
									}
								>
									<span>
										<Trans>All runs</Trans>
									</span>
									<LuArrowUpRight className="size-3.5" />
								</Button>
								<div className="relative">
									<LuSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
									<Input
										value={search}
										onChange={(e) => setSearch(e.target.value)}
										placeholder={t({
											message: "Search",
										})}
										aria-label={t({
											message: "Search automations",
										})}
										className="h-8 w-44 pl-8"
									/>
								</div>
							</div>
						</div>
					)}

					<div className={cn("mt-3", tabEmpty && "flex flex-1 flex-col")}>
						{showAutomationLoading ? (
							<div className="space-y-2">
								{["a", "b", "c", "d", "e", "f"].map((key) => (
									<Skeleton key={key} className="h-10 w-full" />
								))}
							</div>
						) : showAutomationError ? (
							<Empty className="rounded-xl border border-border py-16">
								<EmptyHeader>
									<EmptyMedia
										variant="icon"
										className="size-14 [&_svg:not([class*='size-'])]:size-7"
									>
										<LuTriangleAlert />
									</EmptyMedia>
									<EmptyTitle>
										<Trans>Couldn't load automations</Trans>
									</EmptyTitle>
									<EmptyDescription className="select-text cursor-text">
										{automationsError instanceof Error ? (
											automationsError.message
										) : (
											<Trans>The request failed.</Trans>
										)}
									</EmptyDescription>
								</EmptyHeader>
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										void refetchAutomations();
									}}
								>
									<LuRotateCw className="size-4" />
									<span>
										<Trans>Try again</Trans>
									</span>
								</Button>
							</Empty>
						) : showMineEmptyState ? (
							<div className="flex flex-1 flex-col py-6">
								<AutomationsEmptyState
									onSelectTemplate={handleSelectTemplate}
									onCreateWithAgent={handleCreateWithAgent}
									isCreating={creatingWithAgent}
									onCreateManually={handleCreateManually}
									isCreatingManually={creatingAutomation}
									showProBadge={showProBadge}
								/>
							</div>
						) : showTeamEmptyState ? (
							<Empty className="rounded-xl border border-border py-16">
								<EmptyHeader>
									<EmptyMedia
										variant="icon"
										className="size-14 [&_svg:not([class*='size-'])]:size-7"
									>
										<LuSearchX />
									</EmptyMedia>
									<EmptyTitle>
										<Trans>No team automations</Trans>
									</EmptyTitle>
									<EmptyDescription>
										<Trans>
											Nobody on your team has shared automations yet.
										</Trans>
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						) : (
							// No overflow-hidden: it would break the sticky header, which
							// sticks relative to the page scroll container.
							<div className="rounded-xl border border-border">
								<DndContext
									sensors={sensors}
									collisionDetection={pointerWithin}
									autoScroll={{ threshold: { x: 0, y: 0.1 } }}
									onDragStart={handleDragStart}
									onDragOver={handleDragOver}
									onDragEnd={handleDragEnd}
									onDragCancel={endDrag}
								>
									<Table className="table-fixed">
										{/* Radius + bg live on the corner cells: Chromium ignores
									    border-radius on table-header-groups, so a thead bg pokes
									    square past the container's rounded corners. */}
										<TableHeader className="sticky top-0 z-10 shadow-[inset_0_-1px_0_0_var(--color-border)] [&_th]:bg-background [&_tr>th:first-child]:rounded-tl-xl [&_tr>th:last-child]:rounded-tr-xl [&_tr]:border-b-0">
											<TableRow className="hover:bg-transparent">
												<TableHead
													className={cn(
														DATA_TABLE_HEAD_CELL,
														"relative transition-[padding] duration-150",
														indentRows ? "pl-11" : "pl-4",
													)}
												>
													{selectable && selectionActive && (
														<Checkbox
															checked={allShownSelected}
															data-partial={
																(selectionActive && !allShownSelected) ||
																undefined
															}
															onClick={(event) => {
																event.preventDefault();
																if (allShownSelected) clearSelection();
																else setSelectedMany(shownOrder, true);
															}}
															aria-label={t({ message: "Select all" })}
															className="absolute inset-y-0 left-3.5 my-auto !translate-y-0 data-[partial]:border-primary animate-in fade-in duration-150"
														/>
													)}
													<SortableHeader
														field="name"
														label={t({
															message: "Name",
														})}
														sortField={sortField}
														sortDirection={sortDirection}
														onSort={handleSort}
													/>
												</TableHead>
												{scope === "team" && (
													<TableHead
														className={cn(DATA_TABLE_HEAD_CELL, "w-[14%]")}
													>
														<SortableHeader
															field="owner"
															label={t({
																message: "Owner",
															})}
															sortField={sortField}
															sortDirection={sortDirection}
															onSort={handleSort}
														/>
													</TableHead>
												)}
												<TableHead
													className={cn(DATA_TABLE_HEAD_CELL, scheduleWidth)}
												>
													<SortableHeader
														field="schedule"
														label={t({
															message: "Schedule",
														})}
														sortField={sortField}
														sortDirection={sortDirection}
														onSort={handleSort}
													/>
												</TableHead>
												<TableHead
													className={cn(DATA_TABLE_HEAD_CELL, statusWidth)}
												>
													<SortableHeader
														field="status"
														label={t({
															message: "Status",
														})}
														sortField={sortField}
														sortDirection={sortDirection}
														onSort={handleSort}
													/>
												</TableHead>
												<TableHead
													className={cn(DATA_TABLE_HEAD_CELL, lastRunWidth)}
												>
													<SortableHeader
														field="lastRun"
														label={
															sortField !== "lastRun"
																? t({ message: "Last run" })
																: lastRunSortMode === "time"
																	? t({ message: "Last run (time)" })
																	: t({ message: "Last run (result)" })
														}
														sortField={sortField}
														sortDirection={sortDirection}
														onSort={handleSort}
													/>
												</TableHead>
												<TableHead
													className={cn(DATA_TABLE_HEAD_CELL, "w-20 pr-4")}
												/>
											</TableRow>
										</TableHeader>
										<TableBody>
											{visible.length === 0 ? (
												<TableRow className="hover:bg-transparent">
													<TableCell
														colSpan={columnCount}
														className="h-24 text-center text-sm text-muted-foreground"
													>
														<Trans>No automations match</Trans>
													</TableCell>
												</TableRow>
											) : sections ? (
												sections.map(({ group, items }) => {
													const key = group ?? UNGROUPED_KEY;
													const collapsed = collapsedGroups.has(key);
													return (
														<Fragment key={key}>
															<AutomationGroupHeaderRow
																group={group}
																count={items.length}
																collapsed={collapsed}
																columnCount={columnCount}
																onToggle={() => toggleGroupCollapsed(key)}
																onCreate={() =>
																	createAutomation({
																		prompt: "",
																		projectId: recentProjectId,
																		group,
																	})
																}
																isCreating={creatingAutomation}
																onSelectAll={
																	selectable && !collapsed
																		? () =>
																				setSelectedMany(
																					items.map((a) => a.id),
																					!items.every((a) =>
																						selected.has(a.id),
																					),
																				)
																		: undefined
																}
																onDeleteGroup={
																	selectable && group !== null
																		? () =>
																				setPendingGroupDelete({
																					group,
																					ids: items.map((a) => a.id),
																				})
																		: undefined
																}
																drop={
																	canDrag
																		? { active: dropActiveFor(group) }
																		: undefined
																}
															/>
															{!collapsed && items.map(renderAutomationRow)}
														</Fragment>
													);
												})
											) : (
												sortedVisible.map(renderAutomationRow)
											)}
										</TableBody>
									</Table>
									<DragOverlay dropAnimation={null} modifiers={[snapToCursor]}>
										{dragIds && (
											<AutomationDragPreview
												name={draggedRows[0]?.name}
												count={dragIds.length}
											/>
										)}
									</DragOverlay>
								</DndContext>
							</div>
						)}
					</div>

					{!cliHintDismissed && !showAutomationLoading && !tabEmpty && (
						<div className="relative mt-4 flex items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2 pr-9">
							<LuTerminal className="size-3.5 shrink-0 text-muted-foreground" />
							<p className="min-w-0 truncate text-xs text-muted-foreground">
								<Trans>
									Tell any agent to use the{" "}
									<code className="select-text cursor-text rounded bg-accent/60 px-1 py-0.5 font-mono text-[11px] text-foreground">
										superset
									</code>{" "}
									CLI to spin up workspaces, run tasks, or manage automations.
								</Trans>{" "}
								<a
									href={`${COMPANY.DOCS_URL}/cli/getting-started`}
									target="_blank"
									rel="noreferrer"
									className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/80"
								>
									<Trans>CLI docs</Trans>
								</a>
							</p>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								onClick={() => setCliHintDismissed(true)}
								aria-label={t({
									message: "Dismiss",
								})}
								className="absolute right-1.5 top-1/2 size-6 -translate-y-1/2 text-muted-foreground hover:text-foreground"
							>
								<LuX className="size-3.5" />
							</Button>
						</div>
					)}
				</div>
			</div>

			{selectable && selectionActive && (
				<div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-4 animate-in fade-in slide-in-from-bottom-2 duration-150">
					<AutomationBulkBar
						count={selected.size}
						groups={groups}
						currentGroup={
							selectedRows.every((a) => a.group === selectedRows[0]?.group)
								? (selectedRows[0]?.group ?? null)
								: undefined
						}
						canPause={selectedRows.some((a) => a.enabled)}
						canResume={selectedRows.some((a) => !a.enabled)}
						busy={bulkEnabledMutation.isPending || deleteMutation.isPending}
						onMove={(group) => setGroup({ ids: [...selected], group })}
						onPause={() =>
							bulkEnabledMutation.mutate({
								ids: selectedRows.filter((a) => a.enabled).map((a) => a.id),
								enabled: false,
							})
						}
						onResume={() =>
							gateFeature(GATED_FEATURES.AUTOMATIONS, () =>
								bulkEnabledMutation.mutate({
									ids: selectedRows.filter((a) => !a.enabled).map((a) => a.id),
									enabled: true,
								}),
							)
						}
						onDelete={() => setPendingDelete(selectedRows)}
						onClear={clearSelection}
					/>
				</div>
			)}

			<HostOfflineRunDialog
				hostId={hostOfflineRun?.hostId ?? null}
				open={!!hostOfflineRun}
				onOpenChange={(next) => {
					if (!next) setHostOfflineRun(null);
				}}
			/>

			<AlertDialog
				open={!!pendingGroupDelete}
				onOpenChange={(next) => {
					if (!next) setPendingGroupDelete(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							<Trans>Delete group "{pendingGroupDelete?.group}"?</Trans>
						</AlertDialogTitle>
						<AlertDialogDescription>
							<Plural
								value={pendingGroupDelete?.ids.length ?? 0}
								one="Its # automation moves to No group. The automation itself is kept."
								other="Its # automations move to No group. The automations themselves are kept."
							/>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Trans>Cancel</Trans>
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (!pendingGroupDelete) return;
								const { group, ids } = pendingGroupDelete;
								setGroup({
									ids,
									group: null,
									successMessage: t({ message: `Deleted group "${group}"` }),
								});
								setPendingGroupDelete(null);
							}}
						>
							<Trans>Delete group</Trans>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={!!pendingDelete}
				onOpenChange={(next) => {
					if (!next) setPendingDelete(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{pendingDelete && pendingDelete.length > 1 ? (
								<Plural
									value={pendingDelete.length}
									one="Delete # automation?"
									other="Delete # automations?"
								/>
							) : (
								<Trans>Delete automation?</Trans>
							)}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{pendingDeleteOnly ? (
								<Trans>
									"{pendingDeleteOnly.name}" will stop firing and its run
									history will be removed. This can't be undone.
								</Trans>
							) : pendingDelete ? (
								<Trans>
									They will stop firing and their run history will be removed.
									This can't be undone.
								</Trans>
							) : null}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Trans>Cancel</Trans>
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={deleteMutation.isPending}
							onClick={() => {
								if (pendingDelete) deleteMutation.mutate(pendingDelete);
							}}
						>
							<Trans>Delete</Trans>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
