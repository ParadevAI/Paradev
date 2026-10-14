import type { AppRouter } from "@superset/host-service";
import type { inferRouterOutputs } from "@trpc/server";

export type UsageAccount =
	inferRouterOutputs<AppRouter>["usage"]["quota"][number];
export interface HostUsageObservation {
	hostUrl: string;
	version: number;
	data: UsageAccount[] | null;
	loading: boolean;
	offline: boolean;
	invalidated?: boolean;
}
