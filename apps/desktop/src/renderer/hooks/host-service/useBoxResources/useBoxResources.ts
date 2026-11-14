import type { AppRouter } from "@superset/host-service";
import { isMissingProcedureError } from "@superset/shared/missing-procedure-error";
import { useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useMatchRoute } from "renderer/hooks/useMatchRoute";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useWorkspaceHostTarget } from "../useWorkspaceHostUrl";

export type BoxResources = NonNullable<
	inferRouterOutputs<AppRouter>["sandbox"]["resources"]
>;

const LIVE_POLL_MS = 5_000;

/** Every ready workspace has a gate address, asleep or not, so only the open one is asked. */
export function useBoxResources(
	workspaceId: string,
	{ enabled }: { enabled: boolean },
): BoxResources | null {
	const openMatch = useMatchRoute()({
		to: "/v2-workspace/$workspaceId",
		fuzzy: true,
	});
	const isOpen = openMatch !== false && openMatch.workspaceId === workspaceId;
	const target = useWorkspaceHostTarget(workspaceId);
	const hostUrl =
		enabled && isOpen && target.status === "ready" && target.kind === "sandbox"
			? target.url
			: null;

	const { data } = useQuery({
		queryKey: ["box-resources", hostUrl],
		enabled: hostUrl !== null,
		queryFn: () => {
			if (!hostUrl) return null;
			return getHostServiceClientByUrl(hostUrl).sandbox.resources.query();
		},
		refetchInterval: (query) =>
			isMissingProcedureError(query.state.error) ? false : LIVE_POLL_MS,
		refetchOnWindowFocus: false,
		retry: false,
		gcTime: 0,
	});
	return hostUrl ? (data ?? null) : null;
}
