import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useHostUsageQuota } from "renderer/hooks/host-service/useHostUsageQuota";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useNow } from "renderer/hooks/useNow";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getAccountUsageState } from "./utils/getAccountUsageState";

export function useAccountUsage(workspaceId: string, terminalId: string) {
	const { t } = useLingui();
	const binding = useTerminalAgentBinding(workspaceId, terminalId);
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const supported =
		binding?.agentId === "claude" || binding?.agentId === "codex";
	const quota = useHostUsageQuota(binding && supported ? hostUrl : null);
	const identity = useQuery({
		queryKey: [
			"session-usage-account",
			hostUrl,
			workspaceId,
			terminalId,
			binding?.startedAt,
			binding?.agentSessionId,
			binding?.launchId,
		],
		enabled: !!hostUrl && !!binding && supported,
		queryFn: () =>
			hostUrl && binding
				? getHostServiceClientByUrl(hostUrl).usage.sessionAccount.query({
						workspaceId,
						terminalId,
						startedAt: binding.startedAt,
					})
				: null,
		staleTime: 30_000,
		refetchInterval: 30_000,
	});
	const now = useNow(30_000);
	const { account, state, tightest } = getAccountUsageState({
		supported,
		identity: identity.isError ? null : identity.data,
		accounts: quota.data ?? [],
		loading: supported && (identity.isPending || quota.isPending),
		failed: quota.isError,
		now: now.getTime(),
	});
	const status =
		state === "loading"
			? t({ message: "Reading usage…" })
			: state === "api"
				? t({ message: "API billing" })
				: state === "unverified"
					? t({ message: "Login unverified" })
					: state === "stale"
						? t({ message: "Usage is out of date" })
						: state === "unavailable"
							? t({ message: "Usage unavailable." })
							: null;
	return { account, binding, hostUrl, now, state, status, tightest };
}
