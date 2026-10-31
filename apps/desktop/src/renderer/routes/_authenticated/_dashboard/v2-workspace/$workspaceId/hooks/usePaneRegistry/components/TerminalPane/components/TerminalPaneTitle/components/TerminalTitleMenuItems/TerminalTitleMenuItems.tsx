import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Bot, GitFork, TerminalSquare } from "lucide-react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import type {
	SurfaceForkPlacement,
	SurfaceForkSource,
} from "../../../../../../hooks/useSurfaceFork";
import { useSurfaceForkSource } from "../../../../../../hooks/useSurfaceForkSource";
import { AccountUsage } from "../../../../../AccountUsage";
import { SurfaceForkMenuItems } from "../../../../../SurfaceForkMenuItems";
import { useHandoffSource } from "../../hooks/useHandoffSource";
import type { SessionAction } from "../TerminalSessionHandoffDialog";

export function TerminalTitleMenuItems({
	workspaceId,
	terminalId,
	onSessionAction,
	onForkIntoOtherSurface,
}: {
	workspaceId: string;
	terminalId: string;
	onSessionAction: (action: SessionAction) => void;
	onForkIntoOtherSurface: (
		source: SurfaceForkSource,
		placement: SurfaceForkPlacement,
	) => void;
}) {
	const { t } = useLingui();
	const { binding, canFork } = useHandoffSource(workspaceId, terminalId);
	const surfaceFork = useSurfaceForkSource(workspaceId, {
		kind: "terminal",
		data: { terminalId },
	});
	const { copyToClipboard } = useCopyToClipboard();
	const copyId = (value: string, copiedMessage: string) =>
		void copyToClipboard(value).then(
			() => toast.success(copiedMessage),
			() => toast.error(t({ message: "Could not copy to the clipboard" })),
		);
	const agentSessionId = binding?.agentSessionId;

	return (
		<>
			<AccountUsage workspaceId={workspaceId} terminalId={terminalId} />
			{binding && (
				<>
					<DropdownMenuSeparator />
					{surfaceFork.enabled && surfaceFork.source && (
						<SurfaceForkMenuItems
							target="chat"
							source={surfaceFork.source}
							onFork={onForkIntoOtherSurface}
						/>
					)}
					<DropdownMenuItem
						disabled={!canFork}
						onSelect={() => onSessionAction("fork")}
					>
						<GitFork />
						<Trans>Fork session…</Trans>
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => onSessionAction("handoff")}>
						<Bot />
						<Trans>Continue with another agent…</Trans>
					</DropdownMenuItem>
				</>
			)}
			<DropdownMenuSeparator />
			<DropdownMenuItem
				onSelect={() =>
					copyId(terminalId, t({ message: "Copied terminal ID" }))
				}
			>
				<TerminalSquare />
				<Trans>Copy terminal ID</Trans>
			</DropdownMenuItem>
			{agentSessionId && (
				<DropdownMenuItem
					onSelect={() =>
						copyId(agentSessionId, t({ message: "Copied agent session ID" }))
					}
				>
					<Bot />
					<Trans>Copy agent session ID</Trans>
				</DropdownMenuItem>
			)}
		</>
	);
}
