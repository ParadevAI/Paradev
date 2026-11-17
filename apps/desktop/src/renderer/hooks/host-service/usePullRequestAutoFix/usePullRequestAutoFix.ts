import { useLingui } from "@lingui/react/macro";
import type { AppRouter } from "@superset/host-service";
import { errorMessage } from "@superset/i18n/errors";
import { isMissingProcedureError } from "@superset/shared/missing-procedure-error";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useCallback, useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { hostQueryFn } from "renderer/lib/hostQueryFn";
import { useWorkspaceEvent } from "../useWorkspaceEvent";

export type PullRequestAutoFixTarget =
	inferRouterOutputs<AppRouter>["prAutoFix"]["get"];
export type PullRequestAutoFixWatch = NonNullable<
	PullRequestAutoFixTarget["watch"]
>;

const FALLBACK_REFETCH_MS = 60_000;

/**
 * The Auto-fix CI state of one PR on one host. Pass the workspace when the
 * caller knows it (the PR pane); otherwise the host finds the workspace on
 * the PR from the project. `target` is null while loading and on a host that
 * predates Auto-fix CI.
 */
export function usePullRequestAutoFix({
	hostUrl,
	prNumber,
	workspaceId,
	projectId,
	enabled = true,
}: {
	hostUrl: string | null;
	prNumber: number | null;
	workspaceId?: string | null;
	projectId?: string | null;
	enabled?: boolean;
}) {
	const { t } = useLingui();
	const queryClient = useQueryClient();
	const input: {
		prNumber: number;
		workspaceId?: string;
		projectId?: string;
	} | null =
		prNumber === null
			? null
			: workspaceId
				? { prNumber, workspaceId }
				: projectId
					? { prNumber, projectId }
					: null;
	const queryKey = useMemo(
		() => [
			"pr-auto-fix",
			hostUrl,
			input?.workspaceId ?? null,
			input?.projectId ?? null,
			input?.prNumber ?? null,
		],
		[hostUrl, input?.workspaceId, input?.projectId, input?.prNumber],
	);
	const query = useQuery({
		queryKey,
		enabled: enabled && hostUrl !== null && input !== null,
		staleTime: 15_000,
		queryFn: hostQueryFn(hostUrl, (url, { signal }) =>
			input
				? getHostServiceClientByUrl(url).prAutoFix.get.query(input, { signal })
				: Promise.resolve(null),
		),
		retry: (count, error) => !isMissingProcedureError(error) && count < 2,
		refetchInterval: (current) =>
			isMissingProcedureError(current.state.error)
				? false
				: FALLBACK_REFETCH_MS,
	});

	const resolvedWorkspaceId = query.data?.workspaceId ?? null;
	const refresh = useCallback(
		() => void queryClient.invalidateQueries({ queryKey }),
		[queryClient, queryKey],
	);
	const listening = enabled && resolvedWorkspaceId !== null;
	useWorkspaceEvent(
		"pr-auto-fix:changed",
		resolvedWorkspaceId ?? "",
		refresh,
		listening,
	);
	useWorkspaceEvent(
		"agent:bindings-changed",
		resolvedWorkspaceId ?? "",
		refresh,
		listening,
	);
	useWorkspaceEvent(
		"terminal:lifecycle",
		resolvedWorkspaceId ?? "",
		refresh,
		listening,
	);

	const mutation = useMutation({
		mutationFn: (on: boolean) => {
			if (!hostUrl || !input) {
				throw new Error(
					t({ message: "This pull request has no host to act through" }),
				);
			}
			return getHostServiceClientByUrl(hostUrl).prAutoFix.set.mutate({
				...input,
				enabled: on,
			});
		},
		onSuccess: (target) => queryClient.setQueryData(queryKey, target),
		onError: (error) => {
			toast.error(t({ message: "Couldn't update Auto-fix CI" }), {
				description: errorMessage(error),
			});
			refresh();
		},
	});

	return {
		target: query.data ?? null,
		setEnabled: mutation.mutate,
		isPending: mutation.isPending,
	};
}
