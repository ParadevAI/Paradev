import { Trans, useLingui } from "@lingui/react/macro";
import type {
	SessionConfigOption,
	SessionUsage,
} from "@superset/chat/protocol";
import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import type { SessionMode } from "renderer/routes/_authenticated/components/AgentComposer/components/ModePicker";
import { configOptionLabels } from "renderer/routes/_authenticated/components/AgentComposer/utils/configOptionLabels";
import { KNOWN_MODES } from "renderer/routes/_authenticated/components/AgentComposer/utils/modeCopy";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useAccountUsage } from "../../../../../../hooks/useAccountUsage";
import {
	SessionStatusContent,
	type WorkspaceKind,
} from "./components/SessionStatusContent";

export type SessionStatusDetails = {
	workspaceId: string;
	terminalId: string;
	agentLabel?: string;
	configOptions: SessionConfigOption[];
	modes?: SessionMode[];
	currentModeId?: string;
	usage: SessionUsage | null;
};

export function SessionStatusDialog({
	details,
	onOpenChange,
}: {
	details: SessionStatusDetails;
	onOpenChange: (open: boolean) => void;
}) {
	const { i18n } = useLingui();
	const { workspaceId, terminalId } = details;
	const host = useWorkspaceHostTarget(workspaceId);
	const { workspaces } = useHostWorkspaces();
	const row = workspaces.find((workspace) => workspace.id === workspaceId);
	const { account, binding, now, state, status } = useAccountUsage(
		workspaceId,
		terminalId,
	);
	const workspace: WorkspaceKind | undefined =
		host.status === "ready" && host.kind === "sandbox"
			? "cloud"
			: row?.type === "worktree"
				? "worktree"
				: row?.type === "local"
					? "local"
					: undefined;
	const { model, effort, fast } = configOptionLabels(details.configOptions);
	const mode = details.modes?.find(({ id }) => id === details.currentModeId);
	const knownMode = mode && KNOWN_MODES[mode.id];
	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md" aria-describedby={undefined}>
				<DialogHeader>
					<DialogTitle>
						<Trans>Session status</Trans>
					</DialogTitle>
				</DialogHeader>
				<SessionStatusContent
					agent={
						details.agentLabel ??
						(binding ? AGENT_IDENTITY_LABELS[binding.agentId] : undefined)
					}
					model={model}
					effort={effort}
					fast={fast}
					mode={knownMode ? i18n._(knownMode.title) : mode?.label}
					workspace={workspace}
					branch={row?.branch ?? undefined}
					usage={details.usage}
					limits={{
						now,
						status,
						windows:
							state === "ready" || state === "stale"
								? (account?.windows ?? []).filter(
										(window) =>
											Number.isFinite(window.usedPercent) &&
											window.usedPercent >= 0,
									)
								: [],
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}
