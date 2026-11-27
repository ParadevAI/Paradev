import { Trans } from "@lingui/react/macro";
import type { HostAgentConfig } from "@superset/host-service/settings";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import type { TerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import {
	AgentSessionPicker,
	useAgentSessionTarget,
} from "renderer/routes/_authenticated/_dashboard/components/AgentSessionPicker";

interface Props {
	workspaceId: string;
	sessions: TerminalAgentBinding[];
	configs: HostAgentConfig[];
	onClose: () => void;
	onConfirm: (
		choice:
			| { selected: Pick<TerminalAgentBinding, "terminalId" | "startedAt"> }
			| { configId: string },
	) => void;
}

export function ConflictSessionDialog({
	workspaceId,
	sessions,
	configs,
	onClose,
	onConfirm,
}: Props) {
	const { resolved, value, onValueChange } = useAgentSessionTarget({
		sessions,
		configs,
	});
	const send = () => {
		if (resolved?.kind === "new")
			return onConfirm({ configId: resolved.configId });
		const session = sessions.find((s) => s.terminalId === resolved?.terminalId);
		if (session)
			onConfirm({
				selected: {
					terminalId: session.terminalId,
					startedAt: session.startedAt,
				},
			});
	};
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent aria-describedby={undefined} className="max-w-sm">
				<DialogHeader>
					<DialogTitle>
						<Trans>Resolve conflicts</Trans>
					</DialogTitle>
				</DialogHeader>
				<AgentSessionPicker
					workspaceId={workspaceId}
					configs={configs}
					sessions={sessions}
					value={value}
					onValueChange={onValueChange}
				/>
				<DialogFooter>
					<Button variant="ghost" onClick={onClose}>
						<Trans>Cancel</Trans>
					</Button>
					<Button onClick={send} disabled={!resolved}>
						<Trans>Send to agent</Trans>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
