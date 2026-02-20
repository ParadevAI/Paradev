import { Spinner } from "@superset/ui/spinner";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { HiCheckCircle } from "react-icons/hi2";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useTasksFilterStore } from "../../stores/tasks-filter-state";
import { LinearCTA } from "./components/LinearCTA";
import { TasksTableView } from "./components/TasksTableView";
import { type TabValue, TasksTopBar } from "./components/TasksTopBar";
import { type TaskWithStatus, useTasksTable } from "./hooks/useTasksTable";

interface TasksViewProps {
	initialTab?: "all" | "active" | "backlog";
	initialAssignee?: string;
}

export function TasksView({ initialTab, initialAssignee }: TasksViewProps) {
	const navigate = useNavigate();
	const collections = useCollections();
	const currentTab: TabValue = initialTab ?? "all";
	const [searchQuery, setSearchQuery] = useState("");
	const assigneeFilter = initialAssignee ?? null;

	const { setTab: storeSetTab, setAssignee: storeSetAssignee } =
		useTasksFilterStore();

	useEffect(() => {
		storeSetTab(currentTab);
	}, [currentTab, storeSetTab]);

	useEffect(() => {
		storeSetAssignee(assigneeFilter);
	}, [assigneeFilter, storeSetAssignee]);

	const { data: integrations, isLoading: isCheckingLinear } = useLiveQuery(
		(q) =>
			q
				.from({ integrationConnections: collections.integrationConnections })
				.select(({ integrationConnections }) => ({
					...integrationConnections,
				})),
		[collections],
	);

	const isLinearConnected =
		integrations?.some((i) => i.provider === "linear") ?? false;

	const { table, isLoading, slugColumnWidth, rowSelection, setRowSelection } =
		useTasksTable({
			filterTab: currentTab,
			searchQuery,
			assigneeFilter,
		});

	const selectedTasks = useMemo(() => {
		if (!Object.values(rowSelection).some(Boolean)) return [];

		return table
			.getRowModel()
			.rows.filter((row) => row.getIsSelected() && !row.getIsGrouped())
			.map((row) => row.original);
	}, [rowSelection, table]);

	const handleTabChange = (tab: TabValue) => {
		const search: Record<string, string> = {};
		if (tab !== "all") search.tab = tab;
		if (assigneeFilter) search.assignee = assigneeFilter;
		navigate({
			to: "/tasks",
			search,
			replace: true,
		});
	};

	const handleAssigneeFilterChange = (assignee: string | null) => {
		const search: Record<string, string> = {};
		if (currentTab !== "all") search.tab = currentTab;
		if (assignee) search.assignee = assignee;
		navigate({
			to: "/tasks",
			search,
			replace: true,
		});
	};

	const handleTaskClick = (task: TaskWithStatus) => {
		const search: Record<string, string> = {};
		if (currentTab !== "all") search.tab = currentTab;
		if (assigneeFilter) search.assignee = assigneeFilter;
		navigate({
			to: "/tasks/$taskId",
			params: { taskId: task.id },
			search,
		});
	};

	const handleClearSelection = () => {
		setRowSelection({});
	};

	const showLoading = isLoading || isCheckingLinear;
	const showLinearCTA = !showLoading && !isLinearConnected;
	const showEmptyState =
		!showLoading && isLinearConnected && table.getRowModel().rows.length === 0;
	const showTable =
		!showLoading && isLinearConnected && table.getRowModel().rows.length > 0;

	return (
		<div className="flex-1 flex flex-col min-h-0">
			{!showLinearCTA && (
				<TasksTopBar
					currentTab={currentTab}
					onTabChange={handleTabChange}
					searchQuery={searchQuery}
					onSearchChange={setSearchQuery}
					assigneeFilter={assigneeFilter}
					onAssigneeFilterChange={handleAssigneeFilterChange}
					selectedCount={selectedTasks.length}
					onClearSelection={handleClearSelection}
				/>
			)}

			{showLoading ? (
				<div className="flex-1 flex items-center justify-center">
					<Spinner className="size-5" />
				</div>
			) : showLinearCTA ? (
				<LinearCTA />
			) : showEmptyState ? (
				<div className="flex-1 flex items-center justify-center">
					<div className="flex flex-col items-center gap-2 text-muted-foreground">
						<HiCheckCircle className="h-8 w-8" />
						<span className="text-sm">No tasks found</span>
					</div>
				</div>
			) : showTable ? (
				<TasksTableView
					table={table}
					slugColumnWidth={slugColumnWidth}
					onTaskClick={handleTaskClick}
				/>
			) : null}
		</div>
	);
}
