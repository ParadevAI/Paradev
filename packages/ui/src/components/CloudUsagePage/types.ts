import type { RouterOutputs } from "@superset/trpc";
import type { ComponentType, ReactNode } from "react";

type Cloud = RouterOutputs["cloud"];

export type CloudPeriods = Cloud["periods"]["list"];
export type CloudPeriod = CloudPeriods["items"][number];
export type CloudUsage = Cloud["usage"]["query"];
export type CloudUsageRow = CloudUsage["items"][number];
export type CloudMetrics = CloudUsage["total"];
export type CloudBoots = Cloud["boots"]["list"];
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
	fetchNextPage: () => unknown;
}

/** A place in the cloud usage pages; each app maps it to its own router. `period` is a period id, absent for the newest. */
export type CloudUsageTarget =
	| { page: "overview"; period?: string }
	| { page: "workspaces"; period?: string; user?: string }
	| { page: "workspace"; workspaceId: string; period?: string }
	| { page: "billing" };

export type CloudUsageLink = ComponentType<{
	to: CloudUsageTarget;
	className?: string;
	"aria-label"?: string;
	children: ReactNode;
}>;
