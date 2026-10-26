import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { useState } from "react";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { getTerminalResumedSuccessorQueryKey } from "renderer/hooks/host-service/useTerminalResumedSuccessor/useTerminalResumedSuccessor";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { continueNativeBackground } from "renderer/lib/terminal/continue-native-background";

export function ContinueBackgroundButton({
	workspaceId,
	terminalId,
}: {
	workspaceId: string;
	terminalId: string;
}) {
	const { t } = useLingui();
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const binding = useTerminalAgentBinding(workspaceId, terminalId);
	const queryClient = useQueryClient();
	const [pending, setPending] = useState(false);
	const capability = useQuery({
		queryKey: ["background-recovery-capability", hostUrl],
		enabled: Boolean(hostUrl && !binding),
		retry: false,
		staleTime: 60_000,
		queryFn: () =>
			hostUrl
				? getHostServiceClientByUrl(hostUrl)
						.terminalAgents.backgroundRecoveryCapabilities.query()
						.catch(() => null)
				: null,
	});
	const source = useQuery({
		queryKey: ["background-recovery-source", hostUrl, workspaceId, terminalId],
		enabled: Boolean(
			hostUrl &&
				!binding &&
				capability.data?.version === 1 &&
				capability.data.claudeLiveAttach,
		),
		retry: false,
		staleTime: 15_000,
		queryFn: () =>
			hostUrl
				? getHostServiceClientByUrl(
						hostUrl,
					).terminalAgents.backgroundRecoverySource.query({
						workspaceId,
						terminalId,
					})
				: null,
	});
	if (binding || source.data?.provider !== "claude" || !hostUrl) return null;
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={t({ message: "Continue" })}
					aria-busy={pending}
					disabled={pending}
					className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground disabled:opacity-50"
					onClick={async () => {
						if (pending || !source.data) return;
						setPending(true);
						try {
							const client = getHostServiceClientByUrl(hostUrl);
							const result = await continueNativeBackground(
								{
									workspaceId,
									terminalId,
									expectedRevision: source.data.revision,
								},
								{
									reconnect: (input) =>
										client.terminalAgents.reconnectBackground.mutate(input),
									source: (input) =>
										client.terminalAgents.accountResumeSource.query(input),
									resume: (input) =>
										client.terminalAgents.resumeWithAccount.mutate(input),
								},
							);
							if (!result)
								throw new Error(
									t({
										message:
											"This conversation is no longer available to resume.",
									}),
								);
							const key = getTerminalResumedSuccessorQueryKey(
								workspaceId,
								terminalId,
							);
							await queryClient.cancelQueries({ queryKey: key, exact: true });
							queryClient.setQueryData(key, {
								terminalId: result.terminalId,
								label: result.label,
							});
						} catch (error) {
							toast.error(
								errorMessage(error, t({ message: "Something went wrong" })),
							);
						} finally {
							setPending(false);
							void source.refetch();
						}
					}}
				>
					<Play className="size-3.5" />
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				<Trans>Continue</Trans>
			</TooltipContent>
		</Tooltip>
	);
}
