import type {
	cloudBootsOutputSchema,
	cloudPeriodsOutputSchema,
	cloudUsageOutputSchema,
} from "@superset/shared/cloud-usage-api";
import type { ComponentType, ReactNode } from "react";
import type { z } from "zod";

export type CloudPeriods = z.output<typeof cloudPeriodsOutputSchema>;
export type CloudPeriod = CloudPeriods["items"][number];
export type CloudUsage = z.output<typeof cloudUsageOutputSchema>;
export type CloudUsageRow = CloudUsage["items"][number];
export type CloudMetrics = CloudUsage["total"];
export type CloudBoots = z.output<typeof cloudBootsOutputSchema>;
export type CloudBoot = CloudBoots["items"][number];

export type WorkspaceRef = Extract<
	NonNullable<CloudUsageRow["ref"]>,
	{ status: unknown }
>;
export type PersonRef = NonNullable<WorkspaceRef["owner"]>;

/** The part of a React Query result this page reads, so each app passes its own tRPC binding's result. */
export interface CloudQuery<TData> {
	data: TData | undefined;
	isError: boolean;
	refetch: () => unknown;
}

export interface CloudPages<TPage> extends CloudQuery<{ pages: TPage[] }> {
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	fetchNextPage: () => Promise<unknown>;
}

export type WorkspacesSort = "gbHours" | "hours" | "name" | "status";
export type WorkspacesRows = 15 | 50;

/** The Workspaces page's filters and sort, kept in the URL. Absent means any, and GB-hours for the sort. */
export interface WorkspacesFilters {
	user?: string;
	size?: WorkspaceRef["size"];
	status?: WorkspaceRef["status"];
	q?: string;
	sort?: WorkspacesSort;
	rows?: WorkspacesRows;
	/** 1-based; absent for the first page. */
	page?: number;
}

/** A place in the cloud usage pages; each app maps it to its own router. `period` is a period id, absent for the newest. */
export type CloudUsageTarget =
	| { view: "overview"; period?: string }
	| ({ view: "workspaces"; period?: string } & WorkspacesFilters)
	| { view: "workspace"; workspaceId: string; period?: string }
	| { view: "billing" };

export type WorkspacesTarget = Extract<
	CloudUsageTarget,
	{ view: "workspaces" }
>;

export type CloudUsageLink = ComponentType<{
	to: CloudUsageTarget;
	className?: string;
	"aria-label"?: string;
	children: ReactNode;
}>;
