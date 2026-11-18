import type { RouterOutputs } from "@superset/trpc";

type Cloud = RouterOutputs["cloud"];

export type CloudPeriods = Cloud["periods"]["list"];
export type CloudPeriod = CloudPeriods["items"][number];
export type CloudUsage = Cloud["usage"]["query"];
export type CloudBoots = Cloud["boots"]["list"];
export type CloudBoot = CloudBoots["items"][number];

export type WorkspaceRef = Extract<
	CloudUsage["items"][number]["ref"],
	{ status: unknown }
>;

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
