import { Trans, useLingui } from "@lingui/react/macro";
import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useCallback, useState } from "react";
import { LuArrowUpRight, LuBot, LuX } from "react-icons/lu";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import {
	getHostServiceHeaders,
	getHostServiceWsToken,
} from "renderer/lib/host-service-auth";
import { WorkspaceTrpcProvider } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceTrpcProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import {
	type SidecarStatus,
	SidecarTerminal,
} from "./components/SidecarTerminal";

interface SessionSidecarProps {
	cardId: string;
	workspaceId: string;
	terminalId: string;
	/** Absent when the session is the pane itself and has nothing to hide behind. */
	onClose?: () => void;
	onOpenWorkspace: () => void;
}

/** The session a card came from, shown beside the card instead of in place of it. */
export function SessionSidecar({
	cardId,
	workspaceId,
	terminalId,
	onClose,
	onOpenWorkspace,
}: SessionSidecarProps) {
	const { t } = useLingui();
	const { workspaces } = useHostWorkspaces();
	const workspace = workspaces.find((w) => w.id === workspaceId);
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const binding = useTerminalAgentBinding(workspaceId, terminalId);
	const agentIcon = usePresetIcon(binding?.agentId ?? "superset");
	const agentLabel = binding ? AGENT_IDENTITY_LABELS[binding.agentId] : null;
	const [status, setStatus] = useState<SidecarStatus>("connecting");
	const onStatusChange = useCallback(
		(next: SidecarStatus) => setStatus(next),
		[],
	);
	const statusText: Record<SidecarStatus, string> = {
		connecting: t({ message: "Connecting…" }),
		open: t({ message: "Live" }),
		closed: t({ message: "Disconnected" }),
		ended: t({ message: "Session ended" }),
	};

	return (
		<div className="flex h-full min-w-0 flex-col border-l border-border bg-background">
			<div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-border px-3">
				{agentIcon ? (
					<img
						src={agentIcon}
						alt=""
						className="size-5 shrink-0 rounded-md object-contain"
					/>
				) : (
					<LuBot
						className="size-4 shrink-0 text-muted-foreground"
						strokeWidth={1.5}
					/>
				)}
				<div className="min-w-0 flex-1 leading-tight">
					<div className="truncate text-xs font-medium text-foreground">
						{workspace?.name ?? <Trans>Session</Trans>}
					</div>
					<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
						{agentLabel && (
							<>
								<span className="truncate">{agentLabel}</span>
								<span aria-hidden>·</span>
							</>
						)}
						<span
							className={cn(
								"flex items-center gap-1",
								status === "open" && "text-success",
							)}
						>
							<span
								aria-hidden
								className={cn(
									"size-1.5 rounded-full",
									status === "open"
										? "bg-success"
										: status === "connecting"
											? "animate-pulse bg-muted-foreground"
											: "bg-muted-foreground/50",
								)}
							/>
							{statusText[status]}
						</span>
					</div>
				</div>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							className="size-6 text-muted-foreground"
							aria-label={t({ message: "Open in workspace" })}
							onClick={onOpenWorkspace}
						>
							<LuArrowUpRight className="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<Trans>Open in workspace</Trans>
					</TooltipContent>
				</Tooltip>
				{onClose && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								className="size-6 text-muted-foreground"
								aria-label={t({ message: "Hide session" })}
								onClick={onClose}
							>
								<LuX className="size-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<Trans>Hide session</Trans>
						</TooltipContent>
					</Tooltip>
				)}
			</div>
			{hostUrl ? (
				<WorkspaceTrpcProvider
					cacheKey={`inbox-sidecar:${workspaceId}`}
					hostUrl={hostUrl}
					headers={() => getHostServiceHeaders(hostUrl)}
					wsToken={() => getHostServiceWsToken(hostUrl)}
				>
					<SidecarTerminal
						workspaceId={workspaceId}
						terminalId={terminalId}
						instanceId={`inbox-sidecar:${cardId}`}
						onStatusChange={onStatusChange}
					/>
				</WorkspaceTrpcProvider>
			) : (
				<p className="px-3 py-4 text-xs text-muted-foreground">
					<Trans>
						The machine this session runs on is not reachable right now.
					</Trans>
				</p>
			)}
		</div>
	);
}
