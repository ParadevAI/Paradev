import {
	columnFilteringFeature,
	columnGroupingFeature,
	createExpandedRowModel,
	createFilteredRowModel,
	createGroupedRowModel,
	rowExpandingFeature,
	rowSelectionFeature,
	tableFeatures,
} from "@tanstack/react-table";

export const tasksTableFeatures = tableFeatures({
	columnFilteringFeature,
	filteredRowModel: createFilteredRowModel(),
	columnGroupingFeature,
	groupedRowModel: createGroupedRowModel(),
	rowExpandingFeature,
	expandedRowModel: createExpandedRowModel(),
	rowSelectionFeature,
});

export type TasksTableFeatures = typeof tasksTableFeatures;
