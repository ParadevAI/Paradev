import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { useFormat } from "@superset/i18n/react";
import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LuTriangleAlert } from "react-icons/lu";
import { useTerminalAgentBindings } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { refreshSandboxAccess } from "renderer/routes/_authenticated/providers/SandboxAccessProvider";

/** A new sign-in of another kind reaches an agent only when it starts again. */
export function AgentCredentialsChangedBanner({
	workspaceId,
	cloudWorkspaceId,
	agents,
}: {
	workspaceId: string;
	cloudWorkspaceId: string;
	agents: string[];
}) {
	const { t } = useLingui();
	const { formatList } = useFormat();
	const queryClient = useQueryClient();
	const bindings = useTerminalAgentBindings(workspaceId);
	const restart = useMutation({
		mutationFn: () =>
			apiTrpcClient.cloudWorkspace.restart.mutate({ id: cloudWorkspaceId }),
		onSuccess: () => refreshSandboxAccess(queryClient, cloudWorkspaceId),
		onError: (error) => {
			toast.error(
				t({
					message: `Couldn't restart the workspace: ${errorMessage(error)}`,
				}),
			);
		},
	});
	const running = agents.filter((agent) =>
		[...bindings.values()].some(
			(binding) => binding.agentId === agent && !binding.endedAt,
		),
	);
	if (running.length === 0) return null;
	const names = formatList(
		running.map(
			(agent) =>
				AGENT_IDENTITY_LABELS[agent as keyof typeof AGENT_IDENTITY_LABELS] ??
				agent,
		),
	);

	return (
		<div
			aria-live="polite"
			className="flex shrink-0 items-center gap-3 border-t border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground/85"
		>
			<LuTriangleAlert
				className="size-4 shrink-0 text-foreground/85"
				aria-hidden="true"
			/>
			<span className="min-w-0 flex-1 truncate">
				{t({
					message: `${names} still uses your previous sign-in. Restart to use the new one.`,
				})}
			</span>
			<button
				type="button"
				disabled={restart.isPending}
				onClick={() => restart.mutate()}
				className="shrink-0 rounded px-1.5 py-0.5 font-medium text-foreground hover:bg-warning/20 disabled:opacity-60"
			>
				{restart.isPending
					? t({ message: "Restarting…" })
					: t({ message: "Restart workspace" })}
			</button>
		</div>
	);
}
